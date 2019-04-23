// Copyright (c) Microsoft Corporation
// All rights reserved.
//
// MIT License
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
// to permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
// BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import {FontClassNames, FontWeights, FontSizes} from '@uifabric/styling';
import c from 'classnames';
import {get, isEmpty, isNil} from 'lodash';
import {DateTime} from 'luxon';
import {ActionButton, DefaultButton} from 'office-ui-fabric-react/lib/Button';
import {Dropdown} from 'office-ui-fabric-react/lib/Dropdown';
import {Link} from 'office-ui-fabric-react/lib/Link';
import {MessageBar, MessageBarType} from 'office-ui-fabric-react/lib/MessageBar';
import PropTypes from 'prop-types';
import React from 'react';

import t from '../../tachyons.css';

import Card from './card';
import MonacoPanel from './monaco-panel';
import StatusBadge from './status-badge';
import Timer from './timer';
import {getJobMetricsUrl, cloneJob, openJobAttemptsPage} from '../conn';
import {printDateTime, getHumanizedJobStateString, getDurationString} from '../util';

const StoppableStatus = [
  'Running',
  'Waiting',
];

const HintItem = ({header, children}) => (
  <div className={c(t.flex, t.justifyStart)}>
    <div style={{width: '16rem', minWidth: '16rem', fontWeight: FontWeights.semibold}}>
      {header}
    </div>
    <div>{children}</div>
  </div>
);

HintItem.propTypes = {
  header: PropTypes.string.isRequired,
  children: PropTypes.node,
};

export default class Summary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      monacoProps: null,
      modalTitle: '',
      autoReloadInterval: 10 * 1000,
    };

    this.onChangeInterval = this.onChangeInterval.bind(this);
    this.onDismiss = this.onDismiss.bind(this);
    this.showExitDiagnostics = this.showExitDiagnostics.bind(this);
    this.showEditor = this.showEditor.bind(this);
    this.showJobConfig = this.showJobConfig.bind(this);
  }

  onChangeInterval(e, item) {
    this.setState({autoReloadInterval: item.key});
  }

  onDismiss() {
    this.setState({
      monacoProps: null,
      modalTitle: '',
    });
  }

  showEditor(title, props) {
    this.setState({
      monacoProps: props,
      modalTitle: title,
    });
  }

  showExitDiagnostics() {
    const {jobInfo} = this.props;
    this.showEditor('Exit Diagnostics', {
      language: 'text',
      value: jobInfo.jobStatus.appExitDiagnostics,
    });
  }

  showJobConfig() {
    const {jobConfig} = this.props;
    this.showEditor('Job Config', {
      language: 'json',
      value: JSON.stringify(jobConfig, null, 2),
    });
  }

  getUserFailureHintItems(jobInfo) {
    const result = [];
    const runtimeOutput = get(jobInfo, 'jobStatus.appExitMessages.runtime');
    // reason
    const reason = [];
    // static reason
    const spec = get(jobInfo, 'jobStatus.appExitSpec');
    if (spec && spec.reason) {
      reason.push(
        <div key='spec-reason'>{spec.reason}</div>,
      );
    }
    // dynamic reason
    const code = jobInfo.jobStatus.appExitCode;
    if (code > 0) {
      if (runtimeOutput && runtimeOutput.reason) {
        reason.push(
          <div key='runtime-reason'>{runtimeOutput.reason}</div>,
        );
      }
    } else {
      const launcherOutput = get(jobInfo, 'jobStatus.appExitMessages.launcher');
      if (launcherOutput) {
        reason.push(
          <div key='launcher-reason'>{launcherOutput}</div>,
        );
      }
    }
    if (!isEmpty(reason)) {
      result.push(<HintItem key='reason' header='Exit Reason:'>{reason}</HintItem>);
    }
    // solution
    const solution = [];
    if (runtimeOutput && runtimeOutput.solution) {
      solution.push(
        <div key='runtime-solution'>{runtimeOutput.solution}</div>,
      );
    }
    if (spec && spec.solution) {
      solution.push(
        ...spec.solution.map((x, i) => (
          <div key={`spec-reason-${i}`}>{x}</div>
        )),
      );
    }
    if (!isEmpty(solution)) {
      result.push(<HintItem key='solution' header='Exit Solutions:'>{solution}</HintItem>);
    }
    result.push(<div className={t.h1}></div>);
    // trigger task
    const message = get(jobInfo, 'jobStatus.appExitTriggerMessage');
    const role = get(jobInfo, 'jobStatus.appExitTriggerTaskRoleName');
    const idx = get(jobInfo, 'jobStatus.appExitTriggerTaskIndex');
    if (message) {
      result.push(<HintItem key='trigger-message' header='Exit Trigger Message:'>{message}</HintItem>);
    }
    if (role) {
      result.push(<HintItem key='task-role' header='Exit Trigger Task Role:'>{role}</HintItem>);
    }
    if (!isNil(idx)) {
      result.push(<HintItem key='container-id' header='Exit Trigger Task Index:'>{idx}</HintItem>);
    }
    // user exit code
    if (runtimeOutput) {
      const userCode = runtimeOutput.originalUserExitCode;
      if (!isNil(userCode)) {
        result.push(<HintItem key='user-exit-code' header='Original User Exit Code:'>{userCode}</HintItem>);
      }
    }

    return result;
  }

  renderHintMessage() {
    const {jobInfo} = this.props;
    if (!jobInfo) {
      return;
    }

    const state = getHumanizedJobStateString(jobInfo);
    if (state === 'Failed' || state === 'Stopped') {
      const result = [];
      const spec = jobInfo.jobStatus.appExitSpec;
      const type = spec && spec.type;
      // exit code
      const code = jobInfo.jobStatus.appExitCode;
      result.push(<HintItem key='platform-exit-code' header='Exit Code:'>{code}</HintItem>);
      // type
      if (type) {
        result.push(<HintItem key='type' header='Exit Type:'>{type}</HintItem>);
      }
      if (type === 'USER_FAILURE') {
        result.push(...this.getUserFailureHintItems(jobInfo));
      } else {
        result.push(<HintItem key='solution' header='Exit Solutions:'>
          Please send the <Link onClick={this.showExitDiagnostics}>exit diagnostics</Link> to your administrator for further investigation.
        </HintItem>);
      }

      let messageBarType;
      if (state === 'Failed') {
        messageBarType = MessageBarType.error;
      } else {
        messageBarType = MessageBarType.info;
      }

      return (
        <MessageBar messageBarType={messageBarType}>
          <div>
            {result}
          </div>
        </MessageBar>
      );
    } else if (state === 'Waiting') {
      const resourceRetries = get(jobInfo, 'jobStatus.retryDetails.resource');
      if (resourceRetries >= 3) {
        return (
          <MessageBar messageBarType={MessageBarType.warning}>
            <div>
              <HintItem key='conflict-retry-count' header='Conflict Count:'>
                  {resourceRetries}
              </HintItem>
              <HintItem key='resolution' header='Resolution:'>
                <div>
                  Please adjust the resource requirement in your <Link onClick={this.showJobConfig}>job config</Link>, or wait till other jobs release more resources back to the system.
                </div>
              </HintItem>
            </div>
          </MessageBar>
        );
      }
    }
  }

  render() {
    const {autoReloadInterval, modalTitle, monacoProps} = this.state;
    const {className, jobInfo, jobConfig, reloading, onStopJob, onReload} = this.props;
    const hintMessage = this.renderHintMessage();

    return (
      <div className={className}>
        {/* summary */}
        <Card className={c(t.pv4)} style={{paddingLeft: 32, paddingRight: 32}}>
          {/* summary-row-1 */}
          <div className={c(t.flex, t.justifyBetween, t.itemsCenter)}>
            <div
              className={c(t.truncate)}
              style={{
                fontSize: FontSizes.xxLarge,
                fontWeight: FontWeights.regular,
              }}
            >
              {jobInfo.name}
            </div>
            <div className={c(t.flex, t.itemsCenter)}>
              <Dropdown
                styles={{
                  title: [FontClassNames.mediumPlus, {border: 0}],
                }}
                dropdownWidth={180}
                selectedKey={autoReloadInterval}
                onChange={this.onChangeInterval}
                options={[
                  {key: 0, text: 'Disable Auto Refresh'},
                  {key: 10000, text: 'Refresh every 10s'},
                  {key: 30000, text: 'Refresh every 30s'},
                  {key: 60000, text: 'Refresh every 60s'},
                ]}
              />
              <ActionButton
                className={t.ml2}
                styles={{root: [FontClassNames.mediumPlus]}}
                iconProps={{iconName: 'Refresh'}}
                disabled={reloading}
                onClick={onReload}
              >
                Refresh
              </ActionButton>
            </div>
          </div>
          {/* summary-row-2 */}
          <div className={c(t.mt4, t.flex, t.itemsStart)}>
            <div>
              <div className={c(t.gray, FontClassNames.medium)}>Status</div>
              <div className={c(t.mt2)}>
                <StatusBadge status={getHumanizedJobStateString(jobInfo)}/>
              </div>
            </div>
            <div className={t.ml5}>
              <div className={c(t.gray, FontClassNames.medium)}>Start Time</div>
              <div className={c(t.mt2, FontClassNames.mediumPlus)}>
                {printDateTime(DateTime.fromMillis(jobInfo.jobStatus.createdTime))}
              </div>
            </div>
            <div className={t.ml5}>
              <div className={c(t.gray, FontClassNames.medium)}>User</div>
              <div className={c(t.mt2, FontClassNames.mediumPlus)}>
                {jobInfo.jobStatus.username}
              </div>
            </div>
            <div className={t.ml5}>
              <div className={c(t.gray, FontClassNames.medium)}>Virtual Cluster</div>
              <div className={c(t.mt2, FontClassNames.mediumPlus)}>
                {jobInfo.jobStatus.virtualCluster}
              </div>
            </div>
            <div className={t.ml5}>
              <div className={c(t.gray, FontClassNames.medium)}>Duration</div>
              <div className={c(t.mt2, FontClassNames.mediumPlus)}>
                {getDurationString(jobInfo)}
              </div>
            </div>
            <div className={t.ml5}>
              <div className={c(t.gray, FontClassNames.medium)}>Retries</div>
              <Link
                className={c(t.mt2, FontClassNames.mediumPlus)}
                onClick={() => openJobAttemptsPage(jobInfo.jobStatus.retries)}
                disabled={isNil(jobInfo.jobStatus.retries)}
              >
                {jobInfo.jobStatus.retries}
              </Link>
            </div>
          </div>
          {/* summary-row-2.5 error info */}
          {hintMessage && (
            <div className={t.mt4}>
              {hintMessage}
            </div>
          )}
          {/* summary-row-3 */}
          <div className={c(t.mt4, t.flex, t.justifyBetween, t.itemsCenter)}>
            <div className={c(t.flex)}>
              <Link
                styles={{root: [FontClassNames.mediumPlus]}}
                href='#'
                disabled={isNil(jobConfig)}
                onClick={this.showJobConfig}
              >
                View Job Config
              </Link>
              <div className={c(t.bl, t.mh3)}></div>
              <Link
                styles={{root: [FontClassNames.mediumPlus]}}
                href='#'
                disabled={isNil(jobInfo.jobStatus.appExitDiagnostics)}
                onClick={this.showExitDiagnostics}
              >
                View Exit Diagnostics
              </Link>
              <div className={c(t.bl, t.mh3)}></div>
              <Link
                styles={{root: [FontClassNames.mediumPlus]}}
                href={jobInfo.jobStatus.appTrackingUrl}
                target="_blank"
              >
                Go to Application Tracking Page
              </Link>
              <div className={c(t.bl, t.mh3)}></div>
              <Link
                styles={{root: [FontClassNames.mediumPlus]}}
                href={getJobMetricsUrl()}
                target="_blank"
              >
                Go to Job Metrics Page
              </Link>
            </div>
            <div>
              <DefaultButton
                text='Clone'
                onClick={() => cloneJob(jobConfig)}
                disabled={isNil(jobConfig)}
              />
              <DefaultButton
                className={c(t.ml3)}
                text='Stop'
                onClick={onStopJob}
                disabled={!StoppableStatus.includes(getHumanizedJobStateString(jobInfo))}
              />
            </div>
          </div>
          {/* Monaco Editor Modal */}
          <MonacoPanel
            isOpen={!isNil(monacoProps)}
            onDismiss={this.onDismiss}
            title={modalTitle}
            monacoProps={monacoProps}
          />
          {/* Timer */}
          <Timer interval={autoReloadInterval === 0 ? null : autoReloadInterval} func={onReload} />
        </Card>
      </div>
    );
  }
}

Summary.propTypes = {
  className: PropTypes.string,
  jobInfo: PropTypes.object.isRequired,
  jobConfig: PropTypes.object,
  reloading: PropTypes.bool.isRequired,
  onStopJob: PropTypes.func.isRequired,
  onReload: PropTypes.func.isRequired,
};

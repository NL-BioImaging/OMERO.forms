import React from 'react';
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import {buildApiUrl, fetchJson} from './api-client.mjs';
import {
  copiedFromCandidate,
  findReuseHistoryEntry,
  hasFormVersionChanged,
} from './reuse-selection.mjs';

const padDate = value => value < 10 ? `0${value}` : value;

const formatDate = dateString => {
  const date = new Date(dateString);
  return `${date.getFullYear()}-${padDate(date.getMonth() + 1)}-${padDate(date.getDate())} `
    + `${padDate(date.getHours())}:${padDate(date.getMinutes())}:${padDate(date.getSeconds())}`;
};

export default class Reuse extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      candidates: [],
      candidateIndex: undefined,
      historyEntry: undefined,
      formVersion: undefined,
      loading: false,
      loadError: null,
    };
    this.candidateRequest = 0;
    this.previewRequest = 0;
    this.switchCandidate = this.switchCandidate.bind(this);
    this.useCandidate = this.useCandidate.bind(this);
  }

  componentDidMount() {
    this.loadCandidates(this.props);
  }

  componentWillReceiveProps(nextProps) {
    if (
      nextProps.formId !== this.props.formId
      || nextProps.objId !== this.props.objId
      || nextProps.objType !== this.props.objType
    ) {
      this.loadCandidates(nextProps);
    }
  }

  loadCandidates(props) {
    const {urls, formId, objType, objId, users, lookupUsers} = props;
    const requestNumber = ++this.candidateRequest;
    this.previewRequest += 1;
    const request = new Request(
      buildApiUrl(
        urls.base,
        'list_form_reuse_candidates',
        formId,
        objType,
        objId
      ),
      {credentials: 'same-origin'}
    );

    this.setState({
      candidates: [],
      candidateIndex: undefined,
      historyEntry: undefined,
      formVersion: undefined,
      loading: true,
      loadError: null,
    });

    fetchJson(request).then(jsonData => {
      if (requestNumber !== this.candidateRequest) {
        return;
      }
      const candidates = jsonData.candidates || [];
      this.setState({
        candidates,
        candidateIndex: candidates.length > 0 ? 0 : undefined,
        loading: candidates.length > 0,
        loadError: null,
      });

      const userIds = Array.from(new Set(candidates.map(candidate =>
        candidate.changedBy
      ))).filter(userId => !users.hasOwnProperty(userId));
      if (userIds.length > 0) {
        lookupUsers(userIds);
      }
      if (candidates.length > 0) {
        this.loadCandidate(candidates[0], props);
      }
    }).catch(error => {
      if (requestNumber !== this.candidateRequest) {
        return;
      }
      console.error('Error loading reusable submissions:', error);
      this.setState({
        loading: false,
        loadError: `Failed to load reusable submissions: ${error.message}`,
      });
    });
  }

  loadCandidate(candidate, props = this.props) {
    const {urls} = props;
    const requestNumber = ++this.previewRequest;
    const request = new Request(
      buildApiUrl(
        urls.base,
        'get_form_data_history',
        candidate.sourceFormId,
        candidate.sourceObjectType,
        candidate.sourceObjectId
      ),
      {credentials: 'same-origin'}
    );

    this.setState({
      historyEntry: undefined,
      formVersion: undefined,
      loading: true,
      loadError: null,
    });

    fetchJson(request).then(jsonData => {
      if (requestNumber !== this.previewRequest) {
        return;
      }
      const historyEntry = findReuseHistoryEntry(jsonData.data, candidate);
      const formVersion = historyEntry
        ? (jsonData.versions || []).find(version =>
            version.timestamp === historyEntry.formTimestamp
          )
        : undefined;

      if (!historyEntry || !formVersion) {
        throw new Error('The selected submission or its form version is unavailable');
      }
      this.setState({
        historyEntry,
        formVersion,
        loading: false,
        loadError: null,
      });
    }).catch(error => {
      if (requestNumber !== this.previewRequest) {
        return;
      }
      console.error('Error loading reusable submission:', error);
      this.setState({
        loading: false,
        loadError: `Failed to load the reusable submission: ${error.message}`,
      });
    });
  }

  switchCandidate(index, event) {
    event.preventDefault();
    const candidate = this.state.candidates[index];
    this.setState({candidateIndex: index});
    this.loadCandidate(candidate);
  }

  useCandidate() {
    const {candidates, candidateIndex, historyEntry} = this.state;
    const candidate = candidates[candidateIndex];
    if (!candidate || !historyEntry) {
      return;
    }

    const confirmed = window.confirm(
      'Replace the editor values with this submission? Nothing will be saved until you submit the form.'
    );
    if (!confirmed) {
      return;
    }

    this.props.onReuse({
      data: JSON.parse(historyEntry.formData),
      copiedFrom: copiedFromCandidate(candidate),
      sourceLabel: `${candidate.sourceObjectType} “${candidate.sourceObjectName}”`,
    });
  }

  renderCandidates() {
    const {candidates, candidateIndex} = this.state;
    const {users} = this.props;
    if (candidates.length === 0) {
      return (
        <div className='alert alert-info'>
          No reusable submissions were found on other readable objects.
        </div>
      );
    }

    return (
      <ul className='nav nav-pills nav-stacked'>
        {candidates.map((candidate, index) => {
          const changedBy = users[parseInt(candidate.changedBy)]
            || candidate.changedBy;
          return (
            <li
              key={`${candidate.sourceObjectType}-${candidate.sourceObjectId}`}
              role='presentation'
              className={candidateIndex === index ? 'active' : ''}
            >
              <a href='#' onClick={this.switchCandidate.bind(this, index)}>
                <strong>
                  {`${candidate.sourceObjectType}: ${candidate.sourceObjectName}`}
                </strong>
                <br/>
                {`${formatDate(candidate.changedAt)} (${changedBy})`}
                {candidate.message && <span><br/>{candidate.message}</span>}
              </a>
            </li>
          );
        })}
      </ul>
    );
  }

  renderPreview() {
    const {
      candidates,
      candidateIndex,
      historyEntry,
      formVersion,
      loading,
    } = this.state;
    const candidate = candidates[candidateIndex];

    if (loading) {
      return <div className='alert alert-info'>Loading submission…</div>;
    }
    if (!candidate || !historyEntry || !formVersion) {
      return null;
    }

    const changedVersion = hasFormVersionChanged(
      candidate,
      this.props.currentFormTimestamp
    );
    return (
      <div className='panel panel-default'>
        <div className='panel-body'>
          {changedVersion && (
            <div className='alert alert-warning'>
              This submission used an older form definition. Its values will
              be validated against the current definition in the Editor.
            </div>
          )}
          <Form
            schema={JSON.parse(formVersion.schema)}
            uiSchema={JSON.parse(formVersion.uiSchema)}
            formData={JSON.parse(historyEntry.formData)}
            validator={validator}
            disabled={true}
          >
            <button
              type='button'
              className='btn btn-primary'
              onClick={this.useCandidate}
            >
              Use as starting point
            </button>
          </Form>
        </div>
      </div>
    );
  }

  render() {
    const {loadError} = this.state;
    return (
      <div>
        {loadError && <div className='alert alert-danger'>{loadError}</div>}
        <div className='col-sm-6'>{this.renderCandidates()}</div>
        <div className='col-sm-6'>{this.renderPreview()}</div>
      </div>
    );
  }
}

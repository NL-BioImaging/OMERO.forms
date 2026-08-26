import React from 'react';
import Select from 'react-select';
import Forms from './Forms';
import History from './History';
import Reuse from './Reuse';
import {buildApiUrl, fetchJson} from './api-client.mjs';

import './forms.css';
import './bootstrap.css';

export default class Viewer extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      mode: 'Editor',
      forms: {},
      activeFormId: undefined,
      users: {},
      reuseDraft: undefined
    };
    this.reuseToken = 0;

    this.selectMode = this.selectMode.bind(this);
    this.loadApplicableForms = this.loadApplicableForms.bind(this);
    this.switchForm = this.switchForm.bind(this);
    this.lookupUsers = this.lookupUsers.bind(this);
    this.useReusableSubmission = this.useReusableSubmission.bind(this);
    this.consumeReuseDraft = this.consumeReuseDraft.bind(this);
  }

  componentDidMount() {
    const { objType } = this.props;
    this.loadApplicableForms(objType);
  }

  componentWillReceiveProps(nextProps) {
    // If the object selected has changed, reload
    if (
      nextProps.objId !== this.props.objId
      || nextProps.objType !== this.props.objType
    ) {
      this.setState({reuseDraft: undefined});
      this.loadApplicableForms(nextProps.objType);
      // Bail out as a reload was required and done
      return;
    }

  }

  selectMode(mode, e) {
    e.preventDefault();
    this.setState({
      mode: mode
    });
  }

  loadApplicableForms(objType) {
    const { activeFormId } = this.state;
    const { urls } = this.props;
    const request = new Request(
      buildApiUrl(urls.base, 'list_applicable_forms', objType),
      {
        credentials: 'same-origin'
      }
    );

    fetchJson(request).then(
      data => {

        const forms = {};
        let existingActiveFormPresent = false;
        data.forms.forEach(form => {
          forms[form.id] = form;
          if (form.id === activeFormId) {
            existingActiveFormPresent = true;
          }
        });

        const stateUpdate = {
          forms
        };

        if (existingActiveFormPresent === false) {
          stateUpdate['activeFormId'] = undefined;
        }

        this.setState(stateUpdate);
      }

    ).catch(error => {
      console.error('Error loading applicable forms:', error);
    });

  }

  lookupUsers(uids) {
    const { users } = this.state;
    const { urls } = this.props;
    const request = new Request(
      `${urls.base}get_users/`,
      {
        method: 'POST',
        body: JSON.stringify({
          userIds: uids
        }),
        credentials: 'same-origin'
      }
    );

    return fetch(
      request
    ).then(
      response => response.json()
    ).then(
      userData => {
        const newUsers = {};
        userData.users.forEach(user => {
          newUsers[parseInt(user.id)] = user.name;
        });

        this.setState({
          users: Object.assign({}, users, newUsers)
        });
      }
    );
  }

  switchForm(selected) {
    const activeFormId = selected !== null ? selected.value : undefined;
    this.setState({
      activeFormId: activeFormId,
      reuseDraft: undefined
    });
  }

  useReusableSubmission(reuseDraft) {
    this.reuseToken += 1;
    this.setState({
      mode: 'Editor',
      reuseDraft: {...reuseDraft, token: this.reuseToken}
    });
  }

  consumeReuseDraft(token) {
    if (this.state.reuseDraft && this.state.reuseDraft.token === token) {
      this.setState({reuseDraft: undefined});
    }
  }

  renderNav() {
    const { mode } = this.state;

    const items = ['Editor', 'History', 'Reuse'].map(m => {
      return (
        <li key={ m } className={ m === mode ? 'active' : '' }>
          <a href='#' onClick={ this.selectMode.bind(this, m) }>{ m }</a>
        </li>
      );
    })

    return (
      <ul className='nav nav-tabs'>
        { items }
      </ul>
    )
  }

  renderFormSelect() {
    const { forms, activeFormId } = this.state;
    const options = [];
    for (let key in forms) {
      if (forms.hasOwnProperty(key)) {
        options.push({
          value: key,
          label: key
        });
      }
    }

    return (
      <Select
        name='formselect'
        onChange={ this.switchForm }
        options={ options }
        value={ activeFormId }
        className={'form-switcher'}
      />
    );
  }

  renderMode() {
    const { mode, activeFormId, users, forms, reuseDraft } = this.state;
    const { urls, objId, objType } = this.props;
    if (!activeFormId) {
      return;
    }

    return (
      <div>
        <div style={{display: mode === 'Editor' ? 'block' : 'none'}}>
        <Forms urls={ urls }
               objType={ objType }
               objId={ objId }
               formId={ activeFormId }
               users = { users }
               lookupUsers = { this.lookupUsers }
               reuseDraft={ reuseDraft }
               onReuseConsumed={ this.consumeReuseDraft }
        />
        </div>
        {mode === 'History' && (
        <History
          urls={ urls }
          objType={ objType }
          objId={ objId }
          formId={ activeFormId }
          users={ users }
          lookupUsers = { this.lookupUsers }
        />
        )}
        {mode === 'Reuse' && (
          <Reuse
            urls={ urls }
            objType={ objType }
            objId={ objId }
            formId={ activeFormId }
            currentFormTimestamp={ forms[activeFormId].timestamp }
            users={ users }
            lookupUsers={ this.lookupUsers }
            onReuse={ this.useReusableSubmission }
          />
        )}
      </div>
    );
  }

  render() {
    return (

      <div>
        { this.renderNav() }
        <div className='container-fluid'>
          <div className='row'>
            <div className='col-sm-12'>
              { this.renderFormSelect() }
            </div>
          </div>
        </div>
        { this.renderMode() }
      </div>
    );

  }
}

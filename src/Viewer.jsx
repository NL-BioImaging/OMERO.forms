import React from 'react';
import Select from 'react-select';
import Forms from './Forms';
import History from './History';

import './forms.css';
import './bootstrap.css';

export default class Viewer extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      mode: 'Editor',
      forms: {},
      activeFormId: undefined,
      users: {}
    };

    this.selectMode = this.selectMode.bind(this);
    this.loadApplicableForms = this.loadApplicableForms.bind(this);
    this.switchForm = this.switchForm.bind(this);
    this.lookupUsers = this.lookupUsers.bind(this);
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
      `${urls.base}list_applicable_forms/${objType}/`,
      {
        credentials: 'same-origin'
      }
    );

    fetch(
      request
    ).then(
      response => response.json()
    ).then(
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

    );

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
      activeFormId: activeFormId
    });
  }

  renderNav() {
    const { mode } = this.state;

    const items = ['Editor', 'History'].map(m => {
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
    const { mode, activeFormId, users } = this.state;
    const { urls, objId, objType } = this.props;
    if (mode === 'Editor' && activeFormId) {
      return (
        <Forms urls={ urls }
               objType={ objType }
               objId={ objId }
               formId={ activeFormId }
               users = { users }
               lookupUsers = { this.lookupUsers }
        />
      );
    } else if (mode === 'History' && activeFormId) {
      return (
        <History
          urls={ urls }
          objType={ objType }
          objId={ objId }
          formId={ activeFormId }
          users={ users }
          lookupUsers = { this.lookupUsers }
        />
      );
    }
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

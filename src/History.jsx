import React from 'react';
import ReactDOM from 'react-dom';
import Select from 'react-select';
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';

const padDate = v => {
  return v < 10 ? '0' + v : v
};

const formatDate = dateString => {
  const d = new Date(dateString);
    return d.getFullYear() + '-'
    + padDate(d.getMonth() + 1) + '-'
    + padDate(d.getDate()) + ' '
    + padDate(d.getHours()) + ':'
    + padDate(d.getMinutes()) + ':'
    + padDate(d.getSeconds());
};

export default class History extends React.Component {

  constructor() {
    super();

    this.state = {
      formData: [],
      formVersions: {},
      dataIndex: undefined
    }

    this.switchData = this.switchData.bind(this);
  }

  componentDidMount() {
    const { formId, objType, objId } = this.props;
    this.getData(formId, objType, objId);
  }

  componentWillReceiveProps(nextProps) {
    // If the object or form selected has changed, reload
    if (
      nextProps.formId !== this.props.formId
      || nextProps.objId !== this.props.objId
      || nextProps.objType !== this.props.objType
    ) {
      this.getData(nextProps.formId, nextProps.objType, nextProps.objId);
    }
  }

  getData(formId, objType, objId) {
    const { urls, users, lookupUsers } = this.props;

    const request = new Request(
      `${urls.base}get_form_data_history/${formId}/${objType}/${objId}/`,
      {
        credentials: 'same-origin'
      }
    );

    fetch(
      request
    ).then(
      response => response.json()
    ).then(
      jsonData => {

        const formVersions = {};
        jsonData.versions.forEach(version => {
          formVersions[version.timestamp] = version;
        });

        this.setState({
          formData: jsonData.data.sort((a, b) => b.changedAt >= a.changedAt),
          dataIndex: 0,
          formVersions: formVersions
        });

        const uids = Array.from(new Set(jsonData.data.map(d => d.changedBy))).filter(uid => !users.hasOwnProperty(uid));
        if (uids.length > 0) {
          lookupUsers(uids);
        }

      }
    );
  }

  switchData(i, e) {
    e.preventDefault();
    this.setState({
      dataIndex: i
    });
  }

  renderForm() {
    const { formData, dataIndex, formVersions } = this.state;

    if (
      formData.length > 0
      && dataIndex !== undefined
    ) {
      const data = formData[dataIndex];
      const version = formVersions[data.formTimestamp];

      return (
        <Form
          schema={ JSON.parse(version.schema) }
          uiSchema={ JSON.parse(version.uiSchema) }
          formData={ JSON.parse(data.formData) }
          validator={validator}  // Add the validator prop
          onSubmit={ this.submitForm }
        >
          <button type="button" className="btn btn-primary disabled">Submit</button>
        </Form>
      );
    }

  }

  renderPills() {
    const { formData, dataIndex } = this.state;
    const { users } = this.props;

    if (
      formData.length > 0
      || dataIndex !== undefined
    ) {

      const pills = formData.map((d, i) => {
        const data = formData[i];
        const changedBy = users[parseInt(data.changedBy)] || data.changedBy;
        return (
          <li key={ i } role="presentation" className={ dataIndex === i ? 'active' : ''}>
            <a href="#" onClick={ this.switchData.bind(this, i) }>
              { `${ formatDate(data.changedAt) } (${ changedBy })` }
              <br/>
              { `${ data.message }` }
            </a>
          </li>
        );
      });

      return (
        <ul className="nav nav-pills nav-stacked">
          { pills }
        </ul>
      );
    }
  }

  render() {
    const { formData, dataIndex } = this.state;

    return (
      <div>

        <div className="col-sm-6">
          { this.renderPills() }
        </div>
        <div className='col-sm-6'>
          <div className="panel panel-default">
            <div className="panel-body">
              { this.renderForm() }
            </div>
          </div>
        </div>

      </div>
    );
  }

}

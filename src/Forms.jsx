import React from 'react';
import ReactDOM from 'react-dom';
import Select from 'react-select';
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';

function compareFormData(d1, d2) {
  // No previous data
  if (d2 === undefined) {
    return false;
  }

  // Previous data, compare values
  for (var key in d1) {
      if (d1.hasOwnProperty(key)) {
        if (d1[key] === Object(d1[key])) {
          if (!compareFormData(d1[key], d2[key])) {
            return false;
          }
        } else if (d1[key] !== d2[key]) {
          return false;
        }
      }
  }
  return true;
}

export default class Forms extends React.Component {

  constructor() {
    super();

    this.state = {
      timestamp: undefined,
      schema: undefined,
      uiSchema: undefined,
      data: undefined,
      message: ''
    }

    this.submitForm = this.submitForm.bind(this);
    this.loadFormAndData = this.loadFormAndData.bind(this);
    this.updateMessage = this.updateMessage.bind(this);
    this.onFormDataChange = this.onFormDataChange.bind(this);
  }

  componentDidMount() {
    const { formId, objType, objId } = this.props;
    this.loadFormAndData(formId, objType, objId);
  }

  componentWillReceiveProps(nextProps) {
    if (
      this.props.formId !== nextProps.formId
      || this.props.objType !== nextProps.objType
      || this.props.objId !== nextProps.objId
    ) {
      this.loadFormAndData(nextProps.formId, nextProps.objType, nextProps.objId);
    }
  }

  updateMessage(e) {
    this.setState({
      message: e.target.value
    });
  }

  onFormDataChange(form) {
    this.setState({
      data: form.formData
    });
  }

  loadFormAndData(formId, objType, objId) {

    // If there is no formId, then there is no form to display. clear the state
    if (!formId) {
      this.setState({
        timestamp: undefined,
        schema: undefined,
        uiSchema: undefined,
        data: undefined,
        message: undefined
      });

    } else {

      const formRequest = new Request(
        `${this.props.urls.base}get_form/${formId}/`,
        {
          credentials: 'same-origin'
        }
      );

      const dataRequest = new Request(
        `${this.props.urls.base}get_form_data/${formId}/${objType}/${objId}/`,
        {
          credentials: 'same-origin'
        }
      );

      const formP = fetch(formRequest).then(response => response.json());
      const dataP = fetch(dataRequest).then(response => response.json());

      Promise.all(
        [formP, dataP]
      ).then(
        ([formJson, dataJson]) => {
          const form = formJson.form;
          const data = dataJson.data;
          this.setState({
            timestamp: form.timestamp,
            schema: JSON.parse(form.schema),
            uiSchema: JSON.parse(form.uiSchema),
            data: data ? JSON.parse(data.formData) : {},
            message: ''
          });
        }
      );
    }
  }

  submitForm(formDataSubmission) {
    const { data, timestamp, message }  = this.state;
    const { formId, objType, objId } = this.props;

    // If there are no changes, bail out as there is nothing to be done
    // TODO Store the form data for comparison
    // if (compareFormData(
    //   formDataSubmission.formData,
    //   data
    // )) {
    //   return;
    // }

    let updateForm = {
      'data': JSON.stringify(data),
      'formTimestamp': timestamp,
      'message': message
    };

    // Take the form data, submit this to django
    $.ajax({
      url: `${ this.props.urls.base }save_form_data/${ formId }/${ objType }/${ objId }/`,
      type: 'POST',
      data: JSON.stringify(updateForm),
      success: function(data) {

        this.setState({
          message: ''
        });

        // Refresh the right panel
        $("body").trigger("selection_change.ome");

      }.bind(this),
      error: function(xhr, status, err) {
        console.error(this.props.url, status, err.toString());

        // TODO What do do here?

      }.bind(this)
    });
  }

  renderForm() {
    const { timestamp, schema, uiSchema, data, message } = this.state;

    // Check the timestamp as it is guaranteed to be populated if there is a
    // loaded form
    if (timestamp) {
      return (
        <div>
          <Form
            schema={ schema }
            uiSchema={ uiSchema }
            formData={ data }
            validator={ validator }
            onSubmit={ this.submitForm }
            onChange={ this.onFormDataChange }
            liveValidate={ true }
          />


          <div className='col-sm-11 col-sm-offset-1'>
            <div className='form-group'>
              <label for='message'>Change Message</label>
                <textarea
                  className='form-control'
                  rows='3'
                  placeholder='Enter a summary of the changes made...'
                  value={ message }
                  onChange={ this.updateMessage }
                  id='message'
                />
              </div>
            </div>

        </div>
      );
    }
  }

  render() {

    return (
      <div className="row">
        <div className="col-sm-10 col-sm-offset-1">
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

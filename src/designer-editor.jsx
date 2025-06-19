import React from 'react';
import { Controlled as CodeMirror } from 'react-codemirror2';
import 'codemirror/mode/javascript/javascript';
import 'codemirror/lib/codemirror.css';
import Select from 'react-select';
import { shouldRender } from "@rjsf/utils";
import defaultData from './designer-default';
const samples = {};
import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import { Modal, Button, FormGroup, FormControl } from 'react-bootstrap';
import { Form as BootstrapForm } from 'react-bootstrap';

// Helper function to convert GitHub URLs to raw content URLs
const convertGitHubUrl = (url) => {
  if (url.includes('github.com') && !url.includes('raw.githubusercontent.com')) {
    return url.replace('github.com', 'raw.githubusercontent.com')
               .replace('/blob/', '/');
  }
  return url;
};

// Helper function to extract URL from a message
const extractUrlFromMessage = (message) => {
  if (!message) return '';
  const match = message.match(/from (https:\/\/[^\s]+)$/);
  return match ? match[1] : '';
};

// Patching CodeMirror#componentWillReceiveProps so it's executed synchronously
// Ref https://github.com/mozilla-services/react-jsonschema-form/issues/174
CodeMirror.prototype.componentWillReceiveProps = function (nextProps) {
  if (!this.codeMirror) {
    return; // Early return if codeMirror instance doesn't exist yet
  }

  if (nextProps.value !== undefined && 
      this.codeMirror.getValue() != nextProps.value) {
    this.codeMirror.setValue(nextProps.value);
  }

  if (typeof nextProps.options === 'object' && nextProps.options) {
    Object.keys(nextProps.options).forEach(optionName => {
      if (this.codeMirror && this.codeMirror.setOption) {
        this.codeMirror.setOption(optionName, nextProps.options[optionName]);
      }
    });
  }
};

const log = (type) => console.log.bind(console, type);
const fromJson = (json) => JSON.parse(json);
const toJson = (val) => JSON.stringify(val, null, 2);

const cmOptions = {
  theme: 'default',
  height: 'auto',
  viewportMargin: Infinity,
  mode: {
    name: 'javascript',
    json: true,
    statementIndent: 2,
  },
  lineNumbers: true,
  lineWrapping: true,
  indentWithTabs: false,
  tabSize: 2,
};

class NameModal extends React.Component {
  constructor(props) {
    super(props);
    this.state = { name: props.name || '' };
    this.handleChange = this.handleChange.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
    this.handleExit = this.handleExit.bind(this);
  }

  componentWillReceiveProps(nextProps) {
    const { name } = nextProps;
    this.setState({
      name
    });
  }

  handleChange(e) {
    this.setState({
      name: e.target.value
    });
  }

  handleSubmit(e) {
    e.preventDefault();
    const { onChange } = this.props;
    const name = this.state.name.trim();
    onChange(name);
  }

  handleExit() {
    const { name } = this.props;
    this.setState({
      name: name || ''
    });
  }

  render() {
    const { name } = this.state;
    const { show, toggle } = this.props;
    return (
      <Modal show={ show } onHide={ toggle } onExited={ this.handleExit }>
        <form onSubmit={ this.handleSubmit }>
          <Modal.Header closeButton>
            <Modal.Title>Modal heading</Modal.Title>
          </Modal.Header>
          <Modal.Body>
              <FormGroup
                controlId="formNameText"
              >
                <BootstrapForm.Label>Form Name</BootstrapForm.Label>
                <FormControl
                  type="text"
                  value={ name }
                  placeholder="Enter form name..."
                  onChange={ this.handleChange }
                />
                <FormControl.Feedback />
                <BootstrapForm.Text>This must be a unique string within the context of the OMERO instance. Forms can be overwritten by the original creator or an admin.</BootstrapForm.Text>
              </FormGroup>
          </Modal.Body>
          <Modal.Footer>
            <Button type="submit">Submit</Button>
            <Button onClick={ toggle }>Close</Button>
          </Modal.Footer>
        </form>
      </Modal>
    );
  }
}

class CodeEditor extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      valid: true, 
      code: props.code,
      options: Object.assign({}, cmOptions)
    };
  }

  // Ensure the component updates when props change
  componentDidUpdate(prevProps) {
    if (prevProps.code !== this.props.code) {
      this.setState({ 
        code: this.props.code,
        valid: true 
      });
    }
  }

  onCodeChange = (editor, data, value) => {
    this.setState({ valid: true, code: value });
    try {
      const parsed = fromJson(value);
      this.props.onChange(parsed);
    } catch(err) {
      console.error(err);
      this.setState({ valid: false });
    }
  };

  render() {
    const { title } = this.props;
    const { code, options, valid } = this.state;
    const icon = valid ? 'ok' : 'remove';
    const cls = valid ? 'valid' : 'invalid';

    return (
      <div className='panel panel-default'>
        <div className='panel-heading'>
          <span className={`${cls} glyphicon glyphicon-${icon}`} />
          {' ' + title}
        </div>
        <CodeMirror
          value={code}
          options={options}
          onBeforeChange={(editor, data, value) => {
            this.setState({ code: value });
          }}
          onChange={this.onCodeChange}
        />
      </div>
    );
  }
}

export default class Editor extends React.Component {
  constructor(props) {
    super(props);

    const { schema, uiSchema, formData, validate } = defaultData;
    this.state = {
      formId: '',
      schema,
      uiSchema,
      formData,
      message: '',
      validate,
      editor: 'default',
      liveValidate: true,
      formTypes: [],
      editable: true,
      owners: [],
      exists: false,
      nameEdit: false,
      urlToLoad: '', 
      urlLoadError: null,
      previousFormId: undefined,
      previousSchema: undefined,
      previousUISchema: undefined,
      previousFormTypes: undefined
    };

    this.selectForm = this.selectForm.bind(this);
    this.selectTypes = this.selectTypes.bind(this);
    this.saveForm = this.saveForm.bind(this);
    this.toggleNameModal = this.toggleNameModal.bind(this);
    this.changeFormName = this.changeFormName.bind(this);
    this.updateName = this.updateName.bind(this);
    this.updateMessage = this.updateMessage.bind(this);
    this.loadFromUrl = this.loadFromUrl.bind(this);
    this.validateFormName = this.validateFormName.bind(this);
  }

  shouldComponentUpdate(nextProps, nextState) {
    return shouldRender(this, nextProps, nextState);
  }

  loadForm(formId) {
    const { urls } = this.props;
    const formRequest = new Request(
      `${ urls.base }get_form/${ formId }/`,
      {
        credentials: 'same-origin'
      }
    );

    fetch(formRequest)
        .then(response => response.json())
        .then(jsonData => {
            const form = jsonData.form;
            const schema = JSON.parse(form.schema);
            const uiSchema = JSON.parse(form.uiSchema);
            
            // Extract URL from message if it exists
            const urlToLoad = extractUrlFromMessage(form.message);
            
            this.setState({
                timestamp: form.timestamp,
                schema,
                uiSchema,
                formData: {},
                formTypes: form.objTypes,
                editable: form.editable,
                owners: form.owners,
                exists: true,
                previousFormId: form.id,
                previousSchema: schema,
                previousUISchema: uiSchema,
                previousFormTypes: form.objTypes,
                urlToLoad,  // Set URL field based on message
                urlLoadError: null  // Clear any previous errors
            });
        });
  }

  selectForm(selection) {
    // Early return if nothing selected
    if (!selection) {
        this.setState({
            formId: '',
            message: '',
            schema: defaultData.schema,
            uiSchema: defaultData.uiSchema,
            formTypes: [],
            urlToLoad: ''  // Clear URL field when resetting
        });
        return;
    }

    // Load selected form
    this.setState({
        formId: selection.value,
        message: ''
    });
    this.loadForm(selection.value);
  }

  selectTypes(selection) {
    // Handle null/undefined selection
    if (!selection) {
      this.setState({ formTypes: [] });
      return;
    }
    // Convert single selection to array if needed
    const selections = Array.isArray(selection) ? selection : [selection];
    this.setState({
      formTypes: selections.map(s => s.value)
    });
  }

  saveForm() {
    const { formId, schema, uiSchema, formTypes, message } = this.state;
    const { forms, updateForm, urls } = this.props;

    const request = new Request(
      `${urls.base}save_form/`,
      {
        method: 'POST',
        body: JSON.stringify({
          id: formId,
          schema: JSON.stringify(schema),
          uiSchema: JSON.stringify(uiSchema),
          message,
          objTypes: formTypes
        }),
        credentials: 'same-origin'
      }
    );

    fetch(request).then(
      response => response.json()
    ).then(
      jsonData => {
        updateForm(jsonData.form)
        this.setState({
          message: '',
          previousSchema: schema,
          previousUISchema: uiSchema,
          previousFormTypes: formTypes
        });
      }
    );

  }

  onSchemaEdited   = (schema) => this.setState({schema});

  onUISchemaEdited = (uiSchema) => this.setState({uiSchema});

  onFormDataEdited = (formData) => this.setState({formData});

  setLiveValidate = () => this.setState({liveValidate: !this.state.liveValidate});

  onFormDataChange = ({formData}) => this.setState({formData});

  toggleNameModal(e) {
    if (e) {
      e.preventDefault();
    }
    const { nameEdit } = this.state;

    this.setState({
      nameEdit: !nameEdit
    });

  }

  loadFromUrl(url) {
    const rawUrl = convertGitHubUrl(url);
    
    fetch(rawUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        const formId = data.title || '';
        
        // Update the state but preserve message if schema hasn't changed
        this.setState(prevState => {
          const isSchemaChanged = JSON.stringify(data) !== JSON.stringify(prevState.previousSchema);
          
          return {
            schema: data,
            formId: formId,
            message: isSchemaChanged ? 
              `Loaded version ${data.version || 'unknown'} from ${url}` : 
              prevState.message,
            urlToLoad: url,
            urlLoadError: null
          };
        });

        // Trigger form name validation
        this.validateFormName(formId);
      })
      .catch(error => {
        console.error('Error loading schema:', error);
        this.setState({
          urlLoadError: `Failed to load schema: ${error.message}`
        });
      });
  }

  validateFormName(name) {
    const { urls } = this.props;

    if (!name || name.length === 0) {
      this.setState({
        editable: true,
        exists: false
      });
      return;
    }

    const request = new Request(
      `${urls.base}get_formid_editable/${name}`,
      {
        credentials: 'same-origin'
      }
    );

    fetch(request)
      .then(response => response.json())
      .then(jsonData => {
        this.setState({
          editable: jsonData.editable,
          owners: jsonData.owners,
          exists: jsonData.exists
        });
      });
  }

  changeFormName(name) {
    this.setState({
      formId: name
    });
  }

  updateName(e) {
    const name = e.target.value;
    this.setState({
      formId: name
    });
    this.validateFormName(name);
  }

  updateMessage(e) {
    this.setState({
      message: e.target.value
    });
  }

  render() {
    const {
      formId,
      schema,
      uiSchema,
      formData,
      message,
      liveValidate,
      validate,
      editor,
      formTypes,
      editable,
      exists,
      nameEdit,
      urlToLoad,
      urlLoadError,
      previousSchema,
      previousUISchema,
      previousFormTypes
    } = this.state;
    const { forms } = this.props;
    const options = Object.keys(forms).sort().map(key => {
      return {
        value: key,
        label: key
      };
    });

    const typeOptions = ['Project', 'Dataset', 'Screen', 'Plate'].map(t => ({
      value: t,
      label: t
    }));

    const unsaved = schema !== previousSchema || uiSchema !== previousUISchema || formTypes !== previousFormTypes;

    let editStatus = (
      <div className='alert alert-success form-small-alert'><strong>Valid form name{ exists && ' (Existing Form)'}</strong></div>
    );

    if (!formId || formId.length === 0) {
      editStatus = (
        <div className='alert alert-danger form-small-alert'><strong>Form must have a name</strong></div>
      );
    } else if (!editable) {
      editStatus = (
        <div className='alert alert-danger form-small-alert'><strong>Form name is owned by someone else</strong></div>
      );
    }


    return (
      <div>

        <div className='col-sm-7'>

          <div className='panel panel-default'>
            <div className='panel-heading'>
              <div className='row'>
                <div className='col-sm-4'>
                  <input
                    type='text'
                    className='form-control'
                    placeholder='Form name...'
                    value={ formId }
                    onChange={ this.updateName }
                  />
                </div>

                <div className='col-sm-2'>
                  <button
                    type='button'
                    className='btn btn-info'
                    onClick={ this.saveForm }
                    disabled={ !formId || !unsaved || !editable }
                  >
                    Save
                    { unsaved && <span className="badge">*</span> }
                  </button>
                </div>

                <div className='col-sm-6'>
                  <Select
                    name='form-chooser'
                    placeholder='Load existing form...'
                    options={ options }
                    onChange={ this.selectForm }
                    styles={{
                      // Fixes the overlapping problem of the component
                      menu: provided => ({ ...provided, zIndex: 9999 })
                    }}
                  />
                </div>
              </div>

              {/* Add new row for URL input */}
              <div className='row' style={{ marginTop: '10px' }}>
                <div className='col-sm-12'>
                  <div className='input-group'>
                    <input
                      type='text'
                      className='form-control'
                      placeholder='Enter schema URL to load...'
                      value={urlToLoad || ''}
                      onChange={(e) => this.setState({ 
                        urlToLoad: e.target.value,
                        urlLoadError: null
                      })}
                    />
                    <span className='input-group-btn'>
                      <button
                        type='button'
                        className='btn btn-info'
                        onClick={() => {
                          if (urlToLoad) {
                            this.loadFromUrl(urlToLoad);
                          }
                        }}
                      >
                        Load from URL
                      </button>
                    </span>
                  </div>
                  {urlLoadError && (
                    <div className='alert alert-danger form-small-alert'>
                      <strong>{urlLoadError}</strong>
                    </div>
                  )}
                </div>
              </div>

              <div className='row'>

                <div className='col-sm-10'>
                  { editStatus }
                </div>

                <div className='col-sm-2'>
                  <BootstrapForm.Check onChange={ this.setLiveValidate } checked={ liveValidate }>Live Validation</BootstrapForm.Check>
                </div>

              </div>

            </div>
            <div className='panel-body'>

              <div className='row'>
                <div className='col-sm-12'>
                  <div className='form-group'>
                    <label for='objTypes'>Object Types</label>
                    <Select
                      name='type-chooser'
                      placeholder='Select applicable types...'
                      isMulti={true}
                      options={typeOptions}
                      value={formTypes.map(type => ({ value: type, label: type }))}
                      onChange={this.selectTypes}
                      id='objTypes'
                    />
                  </div>
                </div>
              </div>

              <div className='row'>
                <div className='col-sm-12'>
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

            </div>

            <CodeEditor title='JSONSchema' theme={editor} code={toJson(schema)}
              onChange={this.onSchemaEdited} />

            <div className='row'>
              <div className='col-sm-6'>
                <CodeEditor title='UISchema' theme={editor} code={toJson(uiSchema)}
                  onChange={this.onUISchemaEdited} />
              </div>
              <div className='col-sm-6'>
                <CodeEditor title='formData' theme={editor} code={toJson(formData)}
                  onChange={this.onFormDataEdited} />
              </div>
            </div>
          </div>

        </div>

        <div className='col-sm-5'>
          <Form
            liveValidate={liveValidate}
            schema={schema}
            validator={validator}
            uiSchema={uiSchema}
            formData={formData}
            onChange={this.onFormDataChange}
            validate={validate}
            onError={log('errors')} />
        </div>

        <NameModal
          name={ formId }
          show={ nameEdit }
          toggle={ this.toggleNameModal }
          onChange={ this.changeFormName }
        />

      </div>
    );
  }
}

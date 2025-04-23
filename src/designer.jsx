import React from "react";
import { render } from "react-dom";
import Editor from './designer-editor';
import Assigner from './designer-assigner';
// import './bootstrap.css';
import './designer-styles.css';
import "codemirror/lib/codemirror.css";

class App extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      forms: {},
      groups: [],
      mode: 'Assigner'
    };

    this.updateForm = this.updateForm.bind(this);
    this.updateFormAssignment = this.updateFormAssignment.bind(this);
  }

  componentDidMount() {
    this.getForms();
    this.getGroups();
  }

  getForms() {
    const { urls } = this.props;

    const request = new Request(
      `${ urls.base }list_forms/`,
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
        data.forms.forEach(form => {
          forms[form.id] = form;
        });

        this.setState({
          forms: forms
        });

      });
  }

  getGroups() {
    const { urls } = this.props;

    const request = new Request(
      `${ urls.base }get_managed_groups/`,
      {
        credentials: 'same-origin'
      }
    );

    fetch(
      request
    ).then(
      response => response.json()
    ).then(
      jsonData => this.setState({
        groups: jsonData.groups
      })
    );
  }

  updateForm(formData) {
    const { forms } = this.state;
    const f = { ...forms };
    f[formData.id] = formData;
    this.setState({
      forms: f
    });
  }

  updateFormAssignment(formId, groupIds) {
    const { forms } = this.state;
    const oldForm = forms[formId];
    const f = { ...forms };
    f[formId] = {
      formId: formId,
      jsonSchema: oldForm.schema,
      uiSchema: oldForm.uiSchema,
      objTypes: oldForm.formTypes,
      groupIds: groupIds
    };

    this.setState({
      forms: f
    });
  }

  selectMode(mode) {
    this.setState({
      mode: mode
    });
  }

  renderNav() {
    const { mode } = this.state;

    const items = ['Editor', 'Assigner'].map(m => {
      return (
        <li className={ m === mode ? 'active' : '' }>
          <a href='#' onClick={ () => this.selectMode(m) }>{ m }</a>
        </li>
      );
    })

    return (
      <ul className="nav nav-tabs">
        { items }
      </ul>
    )
  }

  renderMode() {
    const { mode, forms, groups } = this.state;
    const { urls } = this.props;

    if (mode === 'Editor') {
      return (
        <Editor
          forms={ forms }
          urls={ urls }
          updateForm={ this.updateForm }
        />
      );
    } else if (mode === 'Assigner') {
      return (
        <Assigner
          forms={ forms }
          groups={ groups }
          urls={ urls }
          updateForm={ this.updateFormAssignment }
        />
      )
    }

  }

  render() {
    return (
      <div className="container-fluid">
        <div className="page-header">
          <h1>OMERO.forms Designer</h1>
          { this.renderNav() }
        </div>
        { this.renderMode() }

      </div>
    );
  }
}

render(<App urls={ globalURLs }/>, document.getElementById("omero_forms_panel"));

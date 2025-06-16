import React from 'react';
import Select from "react-select";

export default class Assigner extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      formId: undefined,
      formGroupIds: [],
      assignments: {},
      selectedGroup: null,
      selectedForm: null
    };

    this.selectForm = this.selectForm.bind(this);
    this.selectGroups = this.selectGroups.bind(this);
    this.saveAssignment = this.saveAssignment.bind(this);
  }

  componentDidMount() {
    this.loadAssignments();
  }

  loadAssignments() {
    const { urls } = this.props;
    const request = new Request(
      `${ urls.base }get_form_assignments/`,
      {
        credentials: 'same-origin'
      }
    );

    fetch(
      request
    ).then(
      response => response.json()
    ).then(
      assignmentData => {
        this.setState({
          assignments: assignmentData.assignments
        });
      }
    );
  }

  updateAssignments(form_id, group_ids) {
    const { assignments } = this.state;
    const a = { ...assignments };

  }

  selectForm(selection) {
    const { assignments } = this.state;
    const { forms } = this.props;

    if (selection && selection.value) {
      const form = forms[selection.value];
      if (form) {
        this.setState({
          formId: form.id
        });
        // Calculate which groups are already assigned for this form
        const formGroupIds = Object.keys(assignments).filter(
          key => {
            const a = assignments[key];
            if (a === undefined) {
              return false;
            }
            return a.includes(form.id);
          }
        ).map(
          key => parseInt(key)
        );

        this.setState({
          formGroupIds
        });

      }
    } else {
      this.setState({
        formId: undefined,
        formGroupIds: []
      });
    }
  }

  selectGroups(selection) {
    this.setState({
      formGroupIds: selection.map(s => s.value)
    });
  }

  saveAssignment() {
    const { formId, formGroupIds, assignments } = this.state;
    const { forms, updateForm, groups, urls } = this.props;
    const request = new Request(
      `${ urls.base }save_form_assignment/`,
      {
        method: 'POST',
        body: JSON.stringify({
          formId: formId,
          groupIds: formGroupIds
        }),
        credentials: 'same-origin'
      }
    );

    fetch(
      request
    ).then(
      response => response.json()
    ).then(
      assignmentData => {
        this.setState({
          assignments: assignmentData.assignments
        });
      }
    );

  }

  renderGroupAssignments() {
    const { assignments } = this.state;
    const { groups } = this.props;

    if (groups.length === 0) {
      return;
    }

    const groupSummary = groups.map(
      group => {
        const groupAssignments = assignments[group.id];
        return (
          <tr>
            <td>{ `${ group.name } (${ group.id })` }</td>
            <td>{ groupAssignments ? groupAssignments.join(', ') : '' }</td>
          </tr>
        );
      }
    );

    return (
      <div className='panel panel-default'>
        <div className='panel-heading'>Group Assignment Summary</div>

        <table className='table'>
          <thead>
            <tr>
              <th>Group</th>
              <th>Forms</th>
            </tr>
          </thead>
          <tbody>
            { groupSummary }
          </tbody>

        </table>
      </div>
    );
  }

  render() {
    const { formId, formGroupIds, selectedGroup, selectedForm } = this.state;
    const { forms, groups } = this.props;

    // Format form options - using form ID from forms object
    const formOptions = Object.keys(forms).sort().map(key => ({
        value: forms[key].id,
        label: key
    }));

    // Group options with proper ID
    const groupOptions = groups.map(group => ({
        value: group.id,
        label: `${group.name} (${group.id})`
    }));

    return (
      <div>
        <div className='panel panel-default'>
          <div className='panel-body'>
            <div className="col-sm-3">
              <Select
                name='form-chooser'
                placeholder='Select a form...'
                value={formOptions.find(opt => opt.value === formId) || null}
                options={formOptions}
                onChange={this.selectForm}
              />
            </div>

            <div className="col-sm-8">
              <Select
                name='group-chooser'
                placeholder='Select groups...'
                isMulti={true}
                value={groupOptions.filter(opt => formGroupIds.includes(opt.value))}
                options={groupOptions}
                onChange={this.selectGroups}
              />
            </div>

            <div className="col-sm-1">
              <button 
                type="button" 
                className="btn btn-default" 
                onClick={this.saveAssignment}
                disabled={!formId || formGroupIds.length === 0}
              >
                Save
              </button>
            </div>
          </div>
        </div>

        {this.renderGroupAssignments()}
      </div>
    );
  }
}

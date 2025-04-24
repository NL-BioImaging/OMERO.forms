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
    this.loadForm = this.loadForm.bind(this);
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

  loadForm(formId) {
    // Logic to load form details can be added here
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

    // Format form options
    const formOptions = Object.keys(forms).sort().map(key => ({
        value: forms[key].id,
        label: key
    }));

    // Fix group options formatting to use proper group properties
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
                value={selectedForm ? { value: selectedForm.id, label: selectedForm.name } : null}
                options={formOptions}
                onChange={this.selectForm}
              />
            </div>

            <div className="col-sm-8">
              <Select
                name='group-chooser'
                placeholder='Select a group...'
                value={selectedGroup ? { 
                    value: selectedGroup.id, 
                    label: `${selectedGroup.name} (${selectedGroup.id})` 
                } : null}
                options={groupOptions}
                onChange={(selection) => {
                    if (!selection) {
                        this.setState({ selectedGroup: null });
                        return;
                    }
                    // Find the full group object from the groups array
                    const selectedGroup = groups.find(g => g.id === selection.value);
                    this.setState({ selectedGroup });
                }}
              />
            </div>

            <div className="col-sm-1">
              <button type="button" className="btn btn-default" onClick={this.saveAssignment}>Save</button>
            </div>
          </div>
        </div>

        {this.renderGroupAssignments()}
      </div>
    );
  }
}

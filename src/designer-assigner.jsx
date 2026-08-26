import React from 'react';
import Select from "react-select";
import {
  canSaveAssignments,
  formIdsForGroup,
  groupIdsFromSelection,
  groupIdsForForm,
  sameAssignmentMembers,
} from './assignment-selection.mjs';
import {buildApiUrl, fetchJson} from './api-client.mjs';

export default class Assigner extends React.Component {
  constructor(props) {
    super(props);

    this.state = {
      formId: undefined,
      formGroupIds: [],
      assignments: {},
      groupEdits: {},
      savingGroupId: null,
      assignmentError: null
    };

    this.selectForm = this.selectForm.bind(this);
    this.selectGroups = this.selectGroups.bind(this);
    this.saveAssignment = this.saveAssignment.bind(this);
    this.selectGroupForms = this.selectGroupForms.bind(this);
    this.saveGroupAssignments = this.saveGroupAssignments.bind(this);
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

    fetchJson(request).then(
      assignmentData => {
        this.setState({
          assignments: assignmentData.assignments,
          groupEdits: {},
          assignmentError: null
        });
      }
    ).catch(error => {
      console.error('Error loading assignments:', error);
      this.setState({assignmentError: error.message});
    });
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
        const formGroupIds = groupIdsForForm(assignments, form.id);

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
      formGroupIds: groupIdsFromSelection(selection)
    });
  }

  selectGroupForms(groupId, selection) {
    this.setState(prevState => ({
      groupEdits: {
        ...prevState.groupEdits,
        [groupId]: groupIdsFromSelection(selection)
      }
    }));
  }

  saveAssignment() {
    const { formId, formGroupIds } = this.state;
    const { urls } = this.props;
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

    fetchJson(request).then(
      assignmentData => {
        const assignments = assignmentData.assignments;
        this.setState({
          assignments,
          groupEdits: {},
          formGroupIds: groupIdsForForm(assignments, formId),
          assignmentError: null
        });
      }
    ).catch(error => {
      console.error('Error saving form assignments:', error);
      this.setState({assignmentError: error.message});
    });

  }

  saveGroupAssignments(groupId) {
    const { assignments, groupEdits, formId } = this.state;
    const { urls } = this.props;
    const formIds = Object.prototype.hasOwnProperty.call(groupEdits, groupId)
      ? groupEdits[groupId]
      : formIdsForGroup(assignments, groupId);
    const request = new Request(
      buildApiUrl(urls.base, 'save_group_form_assignments'),
      {
        method: 'POST',
        body: JSON.stringify({groupId, formIds}),
        credentials: 'same-origin'
      }
    );

    this.setState({savingGroupId: groupId, assignmentError: null});
    fetchJson(request).then(assignmentData => {
      const updatedAssignments = assignmentData.assignments;
      this.setState(prevState => {
        const updatedEdits = {...prevState.groupEdits};
        delete updatedEdits[groupId];
        return {
          assignments: updatedAssignments,
          groupEdits: updatedEdits,
          formGroupIds: formId
            ? groupIdsForForm(updatedAssignments, formId)
            : prevState.formGroupIds,
          savingGroupId: null,
          assignmentError: null
        };
      });
    }).catch(error => {
      console.error('Error saving group assignments:', error);
      this.setState({
        savingGroupId: null,
        assignmentError: error.message
      });
    });

  }

  renderGroupAssignments() {
    const {
      assignments,
      groupEdits,
      savingGroupId,
    } = this.state;
    const { forms, groups } = this.props;

    if (groups.length === 0) {
      return;
    }

    const formOptions = Object.keys(forms).sort().map(formId => ({
      value: forms[formId].id,
      label: formId
    }));

    const groupSummary = groups.map(
      group => {
        const assignedFormIds = formIdsForGroup(assignments, group.id);
        const selectedFormIds = Object.prototype.hasOwnProperty.call(
          groupEdits,
          group.id
        ) ? groupEdits[group.id] : assignedFormIds;
        const changed = !sameAssignmentMembers(
          assignedFormIds,
          selectedFormIds
        );
        return (
          <tr key={group.id}>
            <td>{ `${ group.name } (${ group.id })` }</td>
            <td>
              <Select
                name={`group-${group.id}-forms`}
                placeholder='Select forms...'
                isMulti={true}
                closeMenuOnSelect={false}
                value={formOptions.filter(option =>
                  selectedFormIds.includes(option.value)
                )}
                options={formOptions}
                onChange={selection =>
                  this.selectGroupForms(group.id, selection)
                }
              />
            </td>
            <td>
              <button
                type='button'
                className='btn btn-default'
                disabled={!changed || savingGroupId !== null}
                onClick={() => this.saveGroupAssignments(group.id)}
              >
                {savingGroupId === group.id ? 'Saving...' : 'Save'}
              </button>
            </td>
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
              <th></th>
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
    const { formId, formGroupIds, assignmentError } = this.state;
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
        {assignmentError && (
          <div className='alert alert-danger'>{assignmentError}</div>
        )}
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
              <span className='help-block'>
                Save with no groups selected to unassign this form from all
                groups you manage.
              </span>
            </div>

            <div className="col-sm-1">
              <button 
                type="button" 
                className="btn btn-default" 
                onClick={this.saveAssignment}
                disabled={!canSaveAssignments(formId, formGroupIds)}
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

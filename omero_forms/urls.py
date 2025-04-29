from django.urls import re_path
from . import views

urlpatterns = [
    # Designer App
    re_path(r"^designer/$", views.designer, name="omeroforms_designer"),
    # API/Template - handles both center panel and iframe cases
    re_path(r"^$", views.forms_view, name="omeroforms_base"),
    # List all forms
    re_path(r"^list_forms/$", views.list_forms, name="omeroforms_list_forms"),
    # List the forms that are assigned to the user's active group that
    # apply to the object type
    re_path(
        r"^list_applicable_forms/(?P<obj_type>\w+)/$",
        views.list_applicable_forms,
        name="omeroforms_list_applicable_forms",
    ),
    # Get a form (latest version)
    re_path(r"^get_form/(?P<form_id>[\w ]+)/$", views.get_form, name="omeroforms_get_form"),
    # Get data for a form (latest version) for a certain object
    re_path(
        r"^get_form_data/"
        r"(?P<form_id>[\w ]+)/(?P<obj_type>\w+)/(?P<obj_id>[\w ]+)/$",
        views.get_form_data,
        name="omeroforms_get_form_data",
    ),
    # Get assignments (restricted to those the user can unassign)
    re_path(
        r"get_form_assignments/$",
        views.get_form_assignments,
        name="omeroforms_get_form_assignments",
    ),
    # Get the entire history of a form including all data and the forms used
    # to enter that data
    re_path(
        r"^get_form_data_history/"
        r"(?P<form_id>[\w ]+)/(?P<obj_type>\w+)/(?P<obj_id>[\w ]+)/$",
        views.get_form_data_history,
        name="omeroforms_get_form_data_history",
    ),
    # Get groups that the user can manage
    re_path(
        r"^get_managed_groups/$",
        views.get_managed_groups,
        name="omeroforms_get_managed_groups",
    ),
    # Lookup usernames by uid
    re_path(r"^get_users/$", views.get_users, name="omeroforms_get_users"),
    # Check form id ownership
    re_path(
        r"^get_formid_editable/(?P<form_id>[\w ]+)/$",
        views.get_formid_editable,
        name="omeroforms_get_formid_editable",
    ),
    # Save a form version (potentially a new form)
    re_path(r"^save_form/$", views.save_form, name="omeroforms_save_form"),
    # Save data for a form
    re_path(
        r"^save_form_data/"
        r"(?P<form_id>[\w ]+)/(?P<obj_type>\w+)/(?P<obj_id>[\w ]+)/$",
        views.save_form_data,
        name="omeroforms_save_form_data",
    ),
    # Save a form assignment
    re_path(
        r"^save_form_assignment/$",
        views.save_form_assignment,
        name="omeroforms_save_form_assignment",
    ),
]

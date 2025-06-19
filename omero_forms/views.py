from builtins import str
from django.http import (
    HttpResponse,
    HttpResponseNotAllowed,
    HttpResponseBadRequest,
    Http404,
    HttpResponseServerError,
    JsonResponse,
)

from omeroweb.webclient.decorators import login_required, render_response
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from functools import wraps

import omero
from omero.rtypes import rstring, rlong, wrap, unwrap

from copy import deepcopy
from datetime import datetime

from omeroweb.webclient import tree

import json
import logging

logger = logging.getLogger(__name__)

from . import settings
from . import utils

OMERO_FORMS_PRIV_UID = None


class HttpResponseUnauthorized(HttpResponse):
    def __init__(self, message="Unauthorized"):
        super(HttpResponseUnauthorized, self).__init__(message, status=401)


def get_priv_uid(conn):
    global OMERO_FORMS_PRIV_UID
    if OMERO_FORMS_PRIV_UID is not None:
        return OMERO_FORMS_PRIV_UID

    qs = conn.getQueryService()

    params = omero.sys.ParametersI()
    params.add("username", rstring(settings.OMERO_FORMS_PRIV_USER))

    q = """
        SELECT user.id
        FROM Experimenter user
        WHERE user.omeName = :username
        """

    rows = qs.projection(q, params, conn.SERVICE_OPTS)
    assert len(rows) == 1

    OMERO_FORMS_PRIV_UID = rows[0][0].val
    return OMERO_FORMS_PRIV_UID


def with_su(func):
    def _decorator(request, *args, **kwargs):
        conn = kwargs["conn"]

        # Create a super user connection
        su_conn = conn.clone()
        try:
            # First check if we can get the forms admin user
            admin_user = settings.OMERO_FORMS_PRIV_USER
            admin_pass = settings.OMERO_FORMS_PRIV_PASSWORD
            
            if not admin_user or not admin_pass:
                return HttpResponseServerError(
                    "OMERO.forms configuration error: Missing admin credentials in settings"
                )

            su_conn.setIdentity(admin_user, admin_pass)
            success = su_conn.connect()

            if not success:
                return HttpResponseServerError(
                    f"OMERO.forms admin user '{admin_user}' could not connect. "
                    "Check if user exists and password is correct. "
                    "User must be admin and member of system group only."
                )

            # Verify user has admin privileges
            if not su_conn.isAdmin():
                return HttpResponseServerError(
                    f"OMERO.forms admin user '{admin_user}' exists but lacks admin privileges"
                )

            kwargs["su_conn"] = su_conn
            kwargs["form_master"] = get_priv_uid(conn)
            response = func(request, *args, **kwargs)

            return response
            
        except Exception as e:
            logger.error(f"OMERO.forms admin connection error: {str(e)}")
            return HttpResponseServerError(
                f"OMERO.forms admin connection error: {str(e)}"
            )
        finally:
            if su_conn is not None:
                su_conn.close()

    return wraps(func)(_decorator)


@login_required(setGroupContext=True)
def designer(request, conn=None, **kwargs):
    context = {}
    return render(request, "forms/designer.html", context)


@login_required(setGroupContext=True)
def forms_view(request, conn=None, **kwargs):
    """Handles both center panel and iframe modes with a single template"""
    context = {
        'iframe_mode': bool(request.GET.get('id')),  # True if id param exists
        'csrf_token': request.META["CSRF_COOKIE"],
    }
    return render(request, "forms/forms_init.js.html", context)


@login_required(setGroupContext=True)
@with_su
def list_forms(request, conn=None, su_conn=None, form_master=None, **kwargs):

    if request.method != "GET":
        return HttpResponseNotAllowed("Methods allowed: GET")

    return JsonResponse({"forms": list(utils.list_forms(su_conn, form_master))})


@login_required(setGroupContext=True)
@with_su
def list_applicable_forms(
    request, obj_type=None, conn=None, su_conn=None, form_master=None, **kwargs
):

    if request.method != "GET":
        return HttpResponseNotAllowed("Methods allowed: GET")

    if obj_type is not None and obj_type not in [
        "Project",
        "Dataset",
        "Plate",
        "Screen",
    ]:
        return HttpResponseBadRequest("%s not a valid obj_type" % obj_type)

    group_id = request.session.get("active_group")
    if group_id is None:
        group_id = conn.getEventContext().groupId

    return JsonResponse(
        {"forms": list(utils.list_forms(su_conn, form_master, group_id, obj_type))}
    )


@login_required(setGroupContext=True)
@with_su
def get_form(request, form_id, conn=None, su_conn=None, form_master=None, **kwargs):

    if request.method != "GET":
        return HttpResponseNotAllowed("Methods allowed: GET")

    form = utils.get_form_version(su_conn, conn, form_master, form_id)

    if form is None:
        raise Http404("Form: %s, not found" % form_id)

    return JsonResponse({"form": form})


@login_required(setGroupContext=True)
@with_su
def get_form_data(
    request,
    form_id,
    obj_type,
    obj_id,
    conn=None,
    su_conn=None,
    form_master=None,
    **kwargs
):

    if request.method != "GET":
        return HttpResponseNotAllowed("Methods allowed: GET")

    try:
        obj_id = int(obj_id)
    except:
        return HttpResponseBadRequest("Object ID must be a long integer")

    if obj_type not in ["Project", "Dataset", "Plate", "Screen"]:
        return HttpResponseBadRequest("%s not a valid obj_type" % obj_type)

    # Check permissions
    obj = conn.getObject(obj_type, obj_id)
    if obj is None:
        raise Http404(
            "If this form exists, this user does " "not have permissions to read it"
        )

    form_data = utils.get_form_data(su_conn, form_master, form_id, obj_type, obj_id)

    return JsonResponse({"data": form_data})


@login_required(setGroupContext=True)
def get_managed_groups(request, conn=None, **kwargs):

    if request.method != "GET":
        return HttpResponseNotAllowed("Methods allowed: GET")

    return JsonResponse({"groups": utils.get_managed_groups(conn)})


@login_required(setGroupContext=True)
@with_su
def get_form_assignments(request, conn=None, su_conn=None, form_master=None, **kwargs):

    if request.method != "GET":
        return HttpResponseNotAllowed("Methods allowed: GET")

    managed_group_ids = [group["id"] for group in utils.get_managed_groups(conn)]

    return JsonResponse(
        {
            "assignments": utils.get_group_assignments(
                su_conn, form_master, managed_group_ids
            )
        }
    )


@login_required(setGroupContext=True)
@csrf_exempt
def get_users(request, conn=None, **kwargs):

    if request.method != "POST":
        return HttpResponseNotAllowed("Methods allowed: POST")

    data = json.loads(request.body)

    user_ids = [int(g) for g in data["userIds"]]

    users = list(utils.get_users(conn, user_ids))

    return JsonResponse({"users": users,})


@login_required(setGroupContext=True)
@with_su
def get_form_data_history(
    request,
    form_id,
    obj_type,
    obj_id,
    conn=None,
    su_conn=None,
    form_master=None,
    **kwargs
):

    if request.method != "GET":
        return HttpResponseNotAllowed("Methods allowed: GET")

    if obj_type not in ["Project", "Dataset", "Plate", "Screen"]:
        return HttpResponseBadRequest("%s not a valid obj_type" % obj_type)

    try:
        obj_id = int(obj_id)
    except:
        return HttpResponseBadRequest("Object ID must be a long integer")

    # Check permissions
    obj = conn.getObject(obj_type, obj_id)
    if obj is None:
        raise Http404(
            "If this data exists, this user does " "not have permissions to read it"
        )

    data = list(
        utils.get_form_data_history(su_conn, form_master, form_id, obj_type, obj_id)
    )

    form_versions = utils.get_form_versions(su_conn, form_master, form_id)

    return JsonResponse({"data": data, "versions": form_versions})


@login_required(setGroupContext=True)
@with_su
def get_formid_editable(
    request, form_id, conn=None, su_conn=None, form_master=None, **kwargs
):

    if request.method != "GET":
        return HttpResponseNotAllowed("Methods allowed: GET")

    form = utils.get_form_version(su_conn, conn, form_master, form_id)

    exists = False
    editable = True
    owners = []

    if form is not None:
        exists = True
        editable = form["editable"]
        owners = form["owners"]

    return JsonResponse({"exists": exists, "editable": editable, "owners": owners})


@login_required(setGroupContext=True)
@with_su
@csrf_exempt
def save_form(request, conn=None, su_conn=None, form_master=None, **kwargs):
    # TODO This needs updating to new layout

    if request.method != "POST":
        return HttpResponseNotAllowed("Methods allowed: POST")

    data = json.loads(request.body)
    form_id = data.get("id")
    schema = data.get("schema", "")
    ui_schema = data.get("uiSchema", "")
    message = data.get("message", "")
    obj_types = data.get("objTypes", [])

    # Ensure there is at least a formId
    if form_id is None:
        return HttpResponseBadRequest(
            "Adding or updating a form requires a formId to be specified"
        )

    form_id = form_id.strip()

    if len(form_id) == 0:
        return HttpResponseBadRequest(
            "Adding or updating a form requires a formId to be specified"
        )

    user_id = conn.user.getId()
    admin = conn.isAdmin()

    # Ensure that if this form already exists, the user has permission to
    # overwrite it (i.e. is an owner)
    existing_form = utils.get_form_version(su_conn, conn, form_master, form_id)
    if existing_form is not None:
        if user_id not in existing_form["owners"] and admin is not True:
            return HttpResponseUnauthorized("Updating a form requires ownership")

    # Ensure the object type is valid
    for obj_type in obj_types:
        if obj_type not in ["Project", "Dataset", "Screen", "Plate"]:
            return HttpResponseBadRequest("%s not a valid obj_type" % obj_type)

    form_version = utils.add_form_version(
        su_conn,
        form_master,
        form_id,
        schema,
        ui_schema,
        user_id,
        datetime.now(),
        message,
        obj_types,
    )

    return JsonResponse({"form": form_version})


@login_required(setGroupContext=True)
@with_su
def save_form_data(
    request,
    form_id,
    obj_type,
    obj_id,
    conn=None,
    su_conn=None,
    form_master=None,
    **kwargs
):

    if request.method != "POST":
        return HttpResponseNotAllowed("Methods allowed: POST")

    if obj_type not in ["Project", "Dataset", "Plate", "Screen"]:
        return HttpResponseBadRequest("%s not a valid obj_type" % obj_type)

    try:
        obj_id = int(obj_id)
    except:
        return HttpResponseBadRequest("Object ID must be a long integer")

    update_data = json.loads(request.body)
    form_timestamp = update_data["formTimestamp"]
    form_data = update_data["data"]
    message = update_data["message"]
    changed_at = datetime.now()
    changed_by = conn.user.getId()

    group_id = request.session.get("active_group")
    if group_id is None:
        group_id = conn.getEventContext().groupId

    # Check permissions
    obj = conn.getObject(obj_type, obj_id)
    if obj is None:
        raise Http404(
            "If this form exists, this user does " "not have permissions to read it"
        )

    if obj.canAnnotate() is False:
        return HttpResponseUnauthorized(
            "This user does not have permission " "to submit data to this form"
        )

    utils.add_form_data(
        su_conn,
        form_master,
        form_id,
        form_timestamp,
        message,
        obj_type,
        obj_id,
        form_data,
        changed_by,
        changed_at,
    )

    utils.add_form_data_to_obj(su_conn, conn, form_id, obj_type, obj_id, form_data)

    return HttpResponse("")


@login_required(setGroupContext=True)
@with_su
@csrf_exempt
def save_form_assignment(request, conn=None, su_conn=None, form_master=None, **kwargs):

    if request.method != "POST":
        return HttpResponseNotAllowed("Methods allowed: POST")

    data = json.loads(request.body)

    form_id = data["formId"]
    group_ids = [int(g) for g in data["groupIds"]]

    # Ensure there is at least a formId
    if form_id is None:
        return HttpResponseBadRequest(
            "Adding or updating a form requires a formId to be specified"
        )

    form_id = form_id.strip()

    if len(form_id) == 0:
        return HttpResponseBadRequest(
            "Adding or updating a form requires a formId to be specified"
        )

    # Get the existing assignments
    current = set(utils.get_form_assignments(su_conn, form_master, form_id))
    requested = set(group_ids)
    owned = set([g["id"] for g in utils.get_managed_groups(conn)])

    to_add = requested - current
    to_remove = (owned - requested) & current

    # Disallow assigning groups that the user does not have permissions on
    disallowed_groups = list((requested - owned))
    if len(disallowed_groups) > 0:
        return HttpResponseUnauthorized(
            "Can not assign to groups: %s" % disallowed_groups
        )

    if len(to_add) > 0 or len(to_remove) > 0:
        utils.assign_form(su_conn, form_master, form_id, list(to_add), list(to_remove))

    # TODO Copy of get_form_assignments, refactor
    managed_group_ids = [group["id"] for group in utils.get_managed_groups(conn)]

    return JsonResponse(
        {
            "assignments": utils.get_group_assignments(
                su_conn, form_master, managed_group_ids
            )
        }
    )

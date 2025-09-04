from __future__ import print_function
from builtins import next
from builtins import str
from functools import wraps
import omero
from omero.rtypes import rlong, unwrap, wrap
import json
from datetime import datetime
import re
from copy import deepcopy


class DatetimeEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        # Let the base class default method raise the TypeError
        return json.JSONEncoder.default(self, obj)


def get_formmaster_id(conn, formmaster_username):

    qs = conn.getQueryService()
    params = omero.sys.ParametersI()
    params.add("fm", omero.rtypes.wrap(formmaster_username))

    q = """
        SELECT user.id
        FROM Experimenter user
        WHERE user.omeName = :fm
        """

    rows = qs.projection(q, params, conn.SERVICE_OPTS)
    if len(rows) != 1:
        # TODO Raise exception instead
        print("user '%s' does not exists" % formmaster_username)

    return rows[0][0].val


def add_form_version(
    conn,
    master_user_id,
    form_id,
    schema,
    ui_schema,
    author,
    timestamp,
    message,
    obj_types=[],
):
    """
    Add a form version to the form master user. Creates form wrapper if
    it does not already exist

    form_id must be globally unique
    """

    # TODO Validate schemas??

    namespace = "hms.harvard.edu/omero/forms/schema/%s" % form_id
    params = omero.sys.ParametersI()
    params.addLong("mid", master_user_id)
    params.add("ns", omero.rtypes.wrap(namespace))

    json_data = json.dumps(
        {
            "id": form_id,
            "schema": schema,
            "uiSchema": ui_schema,
            "author": author,
            "timestamp": timestamp.isoformat(),
            "message": message,
        }
    )

    # Update the existing annotation if there is one
    anno = _get_form(conn, master_user_id, form_id)
    if anno is not None:

        kvs = anno.getMapValue()

        # Make any updates to the object types
        new_kvs = []
        for kv in kvs:
            if kv.name == "objType":
                if kv.value in obj_types:
                    obj_types.remove(kv.value)
                    new_kvs.append(kv)
            else:
                new_kvs.append(kv)

        # Add any missing types
        for obj_type in obj_types:
            new_kvs.append(omero.model.NamedValue("objType", obj_type))

        # Add the new version
        new_kvs.insert(0, omero.model.NamedValue(timestamp.isoformat(), json_data))

        kvs[:] = new_kvs

        us = conn.getUpdateService()
        us.saveObject(anno, conn.SERVICE_OPTS)

    # If it does not already exist, create a new one
    else:

        mapAnn = omero.gateway.MapAnnotationWrapper(conn)
        mapAnn.setNs(namespace)

        mapAnn.setValue(
            [
                ["id", form_id],
                [timestamp.isoformat(), json_data],
                ["owner", str(author)],
            ]
            + [["objType", obj_type] for obj_type in obj_types]
        )
        mapAnn.save()

        link = omero.model.ExperimenterAnnotationLinkI()
        link.parent = omero.model.ExperimenterI(master_user_id, False)
        link.child = mapAnn._obj

        update = conn.getUpdateService()
        update.saveObject(link, conn.SERVICE_OPTS)

    # TODO Return a single object the same as an item from get_form
    return {
        "id": form_id,
        "schema": schema,
        "uiSchema": ui_schema,
        "author": author,
        "timestamp": timestamp,
        "message": message,
        "objTypes": obj_types,
    }


def _get_assignments(conn, master_user_id, group_id=None, form_id=None):
    """
    Get all the assignments, optionally limited to a group and/or form. In
    the case of both, there should only be a single result.

    Returns a list of assignment MapAnnotationI objects or None
    """

    qs = conn.getQueryService()

    namespace = "hms.harvard.edu/omero/forms/assignments"

    # TODO Properly test this
    if group_id is not None and form_id is not None:
        namespace += "/%s/%s" % (form_id, group_id)
    elif group_id is not None:
        namespace += "/%%/%d" % group_id
    elif form_id is not None:
        namespace += "/%s/%%" % form_id
    else:
        namespace += "/%/%"

    params = omero.sys.ParametersI()
    params.addLong("mid", master_user_id)
    params.add("ns", omero.rtypes.wrap(namespace))

    # Get all the assignments
    q = """
        SELECT anno
        FROM Experimenter user
        JOIN user.annotationLinks links
        JOIN links.child anno
        WHERE anno.class = MapAnnotation
        AND user.id = :mid
        """

    if group_id is not None and form_id is not None:
        q += " AND anno.ns = :ns"
    else:
        q += " AND anno.ns LIKE :ns"
        
    # Use -1 to bypass query cache and ensure fresh results
    service_opts = deepcopy(conn.SERVICE_OPTS)
    service_opts.setOmeroGroup(-1)

    rows = qs.projection(q, params, service_opts)

    if len(rows) == 0:
        return None

    return [row[0].val for row in rows]


def _build_assignment_lookup(annos):
    """
    Builds a lookup as a dictionary of formIds to groupId lists
    """
    _assignments = {}
    if annos is not None:
        for anno in annos:
            _form_id = None
            _group_id = None
            kvs = anno.getMapValue()
            for kv in kvs:
                if kv.name == "formId":
                    _form_id = kv.value
                elif kv.name == "groupId":
                    _group_id = kv.value
            _assignments.setdefault(_form_id, set()).add(int(_group_id))
    return _assignments


def _build_group_assignment_lookup(annos):
    """
    Builds a lookup as a dictionary of groupIds to formId lists
    """
    _assignments = {}
    if annos is not None:
        for anno in annos:
            _form_id = None
            _group_id = None
            kvs = anno.getMapValue()
            for kv in kvs:
                if kv.name == "formId":
                    _form_id = kv.value
                elif kv.name == "groupId":
                    _group_id = kv.value
            _assignments.setdefault(int(_group_id), set()).add(_form_id)
    return _assignments


def list_forms(conn, master_user_id, group_id=None, obj_type=None):
    """
    List all the forms, optionally limited to those available for a single
    group, and optionally limited to those available for a single object type
    """

    qs = conn.getQueryService()

    _assignments = None
    if group_id is not None:
        _assignments = _build_assignment_lookup(
            _get_assignments(conn, master_user_id, group_id)
        )

    params = omero.sys.ParametersI()
    params.addLong("mid", master_user_id)

    # Get all the annotations attached to the form master user
    q = """
        SELECT anno
        FROM Experimenter user
        JOIN user.annotationLinks links
        JOIN links.child anno
        WHERE anno.class = MapAnnotation
        AND user.id = :mid
        """

    if group_id is None:
        namespace = "hms.harvard.edu/omero/forms/schema/%%"
        params.add("ns", omero.rtypes.wrap(namespace))
        q += " AND anno.ns LIKE :ns"
    elif _assignments is not None and len(_assignments) > 0:
        namespace = "hms.harvard.edu/omero/forms/schema"
        namespaces = [
            namespace + "/%s" % assignment for assignment in list(_assignments.keys())
        ]

        params.add("nss", omero.rtypes.wrap(namespaces))
        q += " AND anno.ns IN (:nss)"
    else:
        # If there are no assignments and a group was specified there can be
        # nothing to list
        return

    rows = qs.projection(q, params, conn.SERVICE_OPTS)
    for row in rows:

        _id = None
        _owners = []
        _obj_types = []

        anno = row[0].val
        kvs = anno.getMapValue()
        # TODO Can these be indexed directly instead of iterating over all
        # the keys looking for the ones we want
        for kv in kvs:
            if kv.name == "id":
                _id = kv.value
            elif kv.name == "owner":
                _owners.append(kv.value)
            elif kv.name == "objType":
                _obj_types.append(kv.value)

        # TODO Ideally this would be a part of the query, but it is easier to
        # simply filter here for now
        if obj_type is None or obj_type in _obj_types:
            # TODO Add form version count and possibly most recent timestamp?
            yield {"id": _id, "objTypes": _obj_types}


def _get_form(conn, master_user_id, form_id):
    """
    Get a particular form

    Returns a MapAnnotationI object or None
    """

    qs = conn.getQueryService()

    namespace = "hms.harvard.edu/omero/forms/schema/%s" % form_id
    params = omero.sys.ParametersI()
    params.addLong("mid", master_user_id)
    params.add("ns", omero.rtypes.wrap(namespace))

    q = """
        SELECT anno
        FROM Experimenter user
        JOIN user.annotationLinks links
        JOIN links.child anno
        WHERE anno.class = MapAnnotation
        AND user.id = :mid
        AND anno.ns = :ns
        """

    rows = qs.projection(q, params, conn.SERVICE_OPTS)

    # TODO Throw Exception
    assert len(rows) <= 1

    if len(rows) == 0:
        return None

    return rows[0][0].val


def get_form_versions(conn, master_user_id, form_id):
    """
    Get all versions of a particular form
    """

    anno = _get_form(conn, master_user_id, form_id)

    if anno is None:
        return None

    _form_versions = []

    kvs = anno.getMapValue()
    # TODO Can these be indexed directly instead of iterating over all
    # the keys looking for the ones we want
    # At the least, we should iterate in reverse order if possible as
    # these are likely at the bottom of the list as new items are prepended
    for kv in kvs:
        if kv.name not in ["id", "owner", "objType"]:
            _form_versions.append(json.loads(kv.value))

    return _form_versions


def get_form_version(conn, user_conn, master_user_id, form_id, timestamp=None):
    """
    Get a particular form version (defaults to the latest)
    """

    anno = _get_form(conn, master_user_id, form_id)

    if anno is None:
        return None

    _id = None
    _owners = []
    _obj_types = []
    _json_data = None

    kvs = anno.getMapValue()
    # TODO Can these be indexed directly instead of iterating over all
    # the keys looking for the ones we want
    # At the least, we should iterate in reverse order if possible as
    # these are likely at the bottom of the list as new items are prepended
    for kv in kvs:
        if kv.name == "id":
            _id = kv.value
        elif kv.name == "owner":
            _owners.append(int(kv.value))
        elif kv.name == "objType":
            _obj_types.append(kv.value)
        elif timestamp is not None and kv.name == timestamp:
            _json_data = kv.value
        elif timestamp is None and _json_data is None:
            _json_data = kv.value

    d = json.loads(_json_data)

    return {
        "id": _id,
        "schema": d["schema"],
        "uiSchema": d["uiSchema"],
        "author": d["author"],
        "timestamp": d["timestamp"],
        "message": d["message"],
        "objTypes": _obj_types,
        "owners": _owners,
        "editable": user_conn.isAdmin() or user_conn.getUserId() in _owners,
    }


def get_group_assignments(conn, master_user_id, group_ids):
    """
    Get all the assignments
    Returns a dictionary. group ids -> [form ids]
    """

    assignments = _build_group_assignment_lookup(_get_assignments(conn, master_user_id))

    allowed_assignments = {}
    for group_id in group_ids:
        if group_id in assignments:
            allowed_assignments[group_id] = list(assignments[group_id])

    return allowed_assignments


def get_form_assignments(conn, master_user_id, form_id):
    """
    Get all the assignments
    Returns a list of group_ids
    """

    annos = _get_assignments(conn, master_user_id, form_id=form_id)
    group_ids = set()
    if annos is not None:
        for anno in annos:
            kvs = anno.getMapValue()
            for kv in kvs:
                if kv.name == "groupId":
                    group_ids.add(int(kv.value))
    return list(group_ids)


def delete_form(conn, master_user_id, form_id):
    """
    Delete a form (and all form versions of that form) from the form master
    user. Also deletes all assignments of that form.

    Does NOT delete any form data annotations which might relate to this
    """

    form_anno = _get_form(conn, master_user_id, form_id)
    assignments_anno = _get_assignments(conn, master_user_id, form_id=form_id)

    annos = []
    if form_anno is not None:
        annos.append(form_anno.id.val)
    if assignments_anno is not None:
        annos.extend([int(aa.id.val) for aa in assignments_anno])

    if len(annos) == 0:
        return

    handle = conn.deleteObjects("MapAnnotation", annos)
    cb = omero.callbacks.CmdCallbackI(conn.c, handle)

    while not cb.block(500):
        pass
    err = isinstance(cb.getResponse(), omero.cmd.ERR)
    if err:
        # TODO Throw exception
        pass
        # print cb.getResponse()
    cb.close(True)


def assign_form(conn, master_user_id, form_id, add_group_ids=[], remove_group_ids=[]):
    """
    Assign a form to some groups
    """

    # See if any of the requested assignments already exist
    # Just get them all and compare in python to avoid multiple round trips
    _assignments = get_form_assignments(conn, master_user_id, form_id)

    new_add_group_ids = [
        group_id for group_id in add_group_ids if group_id not in _assignments
    ]

    new_remove_group_ids = [
        group_id for group_id in remove_group_ids if group_id in _assignments
    ]

    if len(new_add_group_ids) > 0:

        links = []
        for group_id in new_add_group_ids:
            namespace = "hms.harvard.edu/omero/forms/assignments/%s/%d" % (
                form_id,
                group_id,
            )
            map_ann = omero.gateway.MapAnnotationWrapper(conn)
            map_ann.setNs(namespace)
            # TODO Is it possible to save multiple annotations at once?
            map_ann.setValue([["formId", form_id], ["groupId", str(group_id)]])
            map_ann.save()

            link = omero.model.ExperimenterAnnotationLinkI()
            link.parent = omero.model.ExperimenterI(master_user_id, False)
            link.child = map_ann._obj
            links.append(link)

        update = conn.getUpdateService()
        update.saveArray(links, conn.SERVICE_OPTS)

    if len(new_remove_group_ids) > 0:

        namespace = "hms.harvard.edu/omero/forms/assignments/%s" % form_id
        namespaces = [
            "%s/%d" % (namespace, group_id) for group_id in new_remove_group_ids
        ]

        params = omero.sys.ParametersI()
        params.addLong("mid", master_user_id)
        params.add("nss", omero.rtypes.wrap(namespaces))

        qs = conn.getQueryService()
        q = """
            SELECT anno
            FROM Experimenter user
            JOIN user.annotationLinks links
            JOIN links.child anno
            WHERE anno.class = MapAnnotation
            AND user.id = :mid
            AND anno.ns IN (:nss)
            """

        rows = qs.projection(q, params, conn.SERVICE_OPTS)
        annos = [row[0].val for row in rows]

        if len(annos) > 0:
            handle = conn.deleteObjects(
                "MapAnnotation", [anno.id.val for anno in annos]
            )
            cb = omero.callbacks.CmdCallbackI(conn.c, handle)

            while not cb.block(500):
                pass
            err = isinstance(cb.getResponse(), omero.cmd.ERR)
            if err:
                # TODO Throw exception
                pass
                # print cb.getResponse()
            cb.close(True)


def _get_form_data(conn, master_user_id, form_id, obj_type, obj_id):
    """
    Get the form data associated with a particular form for a particular
    object.

    Returns a MapAnnotationI object or None
    """

    namespace = "hms.harvard.edu/omero/forms/data/%s/%s/%s" % (
        obj_type,
        obj_id,
        form_id,
    )

    params = omero.sys.ParametersI()
    params.addLong("mid", master_user_id)
    params.add("ns", omero.rtypes.wrap(namespace))

    qs = conn.getQueryService()
    q = """
        SELECT anno
        FROM Experimenter user
        JOIN user.annotationLinks links
        JOIN links.child anno
        WHERE anno.class = MapAnnotation
        AND user.id = :mid
        AND anno.ns = :ns
        """

    rows = qs.projection(q, params, conn.SERVICE_OPTS)

    if len(rows) == 0:
        return None

    return rows[0][0].val


def list_form_data_orphans(conn, master_user_id):
    """
    Lists the form data associated with a particular form for a particular
    object where the objects no longer exist
    """

    namespace = "hms.harvard.edu/omero/forms/data/%"

    params = omero.sys.ParametersI()
    params.addLong("mid", master_user_id)
    params.add("ns", omero.rtypes.wrap(namespace))

    # Get all the data annotations
    qs = conn.getQueryService()
    q = """
        SELECT anno
        FROM Experimenter user
        JOIN user.annotationLinks links
        JOIN links.child anno
        WHERE anno.class = MapAnnotation
        AND user.id = :mid
        AND anno.ns LIKE :ns
        """

    rows = qs.projection(q, params, conn.SERVICE_OPTS)

    ore = re.compile(
        "hms.harvard.edu/omero/forms/data/"
        "(Project|Dataset|Image|Screen|Plate)([0-9]+)/([A-z0-9]+)"
    )

    obj_types_ids = {}
    obj_form_ids = {}
    for row in rows:
        matches = ore.search(row[0].val.ns.val)

        # Collect the object IDs for each object type
        obj_type = obj_types_ids.setdefault(matches.group(1), [])
        obj_type.append(int(matches.group(2)))
        # collected the form for each object
        obj_form = obj_form_ids.setdefault(
            (matches.group(1), int(matches.group(2))), []
        )
        obj_form.append(matches.group(3))

    for obj_type, obj_ids in obj_types_ids.items():

        params = omero.sys.ParametersI()
        params.addLongs("oids", obj_ids)

        q = (
            """
            SELECT obj.id
            FROM %s obj
            WHERE obj.id IN (:oids)
            """
            % obj_type
        )

        conn.SERVICE_OPTS.setOmeroGroup(-1)
        rows = qs.projection(q, params, conn.SERVICE_OPTS)

        for row in rows:
            # Remove the objects which do exist
            obj_form_ids.pop((obj_type, row[0].val))

    for obj, form_ids in obj_form_ids.items():
        for form_id in form_ids:
            yield {"formId": form_id, "objType": obj[0], "objId": obj[1]}
    return


def add_form_data(
    conn,
    master_user_id,
    form_id,
    form_timestamp,
    message,
    obj_type,
    obj_id,
    data,
    changed_by,
    changed_at,
):
    """
    Add form data and associated metadata to the form master user
    """

    # TODO Check and assert that the object exists
    # qs = conn.getQueryService()

    namespace = "hms.harvard.edu/omero/forms/data/%s/%s/%s" % (
        obj_type,
        obj_id,
        form_id,
    )

    json_data = json.dumps(
        {
            "formId": form_id,
            "formTimestamp": form_timestamp,
            "formData": data,
            "changedBy": changed_by,
            "changedAt": changed_at.isoformat(),
            "message": message,
        }
    )

    # If the appropriate annotation already exists, update it
    anno = _get_form_data(conn, master_user_id, form_id, obj_type, obj_id)
    if anno is not None:

        kvs = anno.getMapValue()

        kvs.insert(0, omero.model.NamedValue(changed_at.isoformat(), json_data))

        us = conn.getUpdateService()
        us.saveObject(anno, conn.SERVICE_OPTS)

    # If it does not already exist, create a new one
    else:

        mapAnn = omero.gateway.MapAnnotationWrapper(conn)
        mapAnn.setNs(namespace)
        mapAnn.setValue([[changed_at.isoformat(), json_data]])
        mapAnn.save()

        link = omero.model.ExperimenterAnnotationLinkI()
        link.parent = omero.model.ExperimenterI(master_user_id, False)
        link.child = mapAnn._obj

        update = conn.getUpdateService()
        update.saveObject(link, conn.SERVICE_OPTS)


def get_form_data_history(conn, master_user_id, form_id, obj_type, obj_id):
    """
    Get the form data (including history) for the specified form on the
    specified object
    """

    anno = _get_form_data(conn, master_user_id, form_id, obj_type, obj_id)

    if anno is not None:
        kvs = anno.getMapValue()
        for kv in kvs:
            loaded_data = json.loads(kv.value)
            yield {
                "formId": loaded_data["formId"],
                "formTimestamp": loaded_data["formTimestamp"],
                "formData": loaded_data["formData"],
                "changedBy": loaded_data["changedBy"],
                "changedAt": datetime.strptime(
                    loaded_data["changedAt"], "%Y-%m-%dT%H:%M:%S.%f"
                ),
                "message": loaded_data["message"],
            }

    else:
        return


def get_form_data(conn, master_user_id, form_id, obj_type, obj_id):
    """
    Get the most recent form data for the specified form on the
    specified object
    """

    return next(
        get_form_data_history(conn, master_user_id, form_id, obj_type, obj_id), None
    )


def delete_form_data(conn, master_user_id, form_id, obj_type, obj_id):
    """
    Delete the form data (including history) for the specified form on the
    specified object
    """

    anno = _get_form_data(conn, master_user_id, form_id, obj_type, obj_id)

    if anno is None:
        # TODO Throw exception or something to indicate nothing to delete?
        return

    handle = conn.deleteObjects("MapAnnotation", [anno.id.val])
    cb = omero.callbacks.CmdCallbackI(conn.c, handle)

    while not cb.block(500):
        pass
    err = isinstance(cb.getResponse(), omero.cmd.ERR)
    if err:
        # TODO Throw exception
        pass
        # print cb.getResponse()
    cb.close(True)


def _get_object(conn, obj_type, obj_id):
    """
    Get an object of the specified type and id

    Returns a <ObjType>I object or None
    """

    params = omero.sys.ParametersI()
    params.addLong("oid", obj_id)

    qs = conn.getQueryService()
    q = (
        """
        SELECT obj
        FROM %s obj
        WHERE obj.id = :oid
        """
        % obj_type
    )

    rows = qs.projection(q, params, conn.SERVICE_OPTS)

    # TODO Throw Exception
    assert len(rows) <= 1

    if len(rows) == 0:
        return None

    return rows[0][0].val


def _get_form_kvdata(conn, form_id, obj_type, obj_id):
    """
    Get the form data associated with a particular form for a particular
    object.

    Returns a MapAnnotationI object or None
    """

    namespace = "hms.harvard.edu/omero/forms/kvdata/%s" % form_id

    params = omero.sys.ParametersI()
    params.addLong("oid", obj_id)
    params.add("ns", omero.rtypes.wrap(namespace))

    qs = conn.getQueryService()

    service_opts = deepcopy(conn.SERVICE_OPTS)
    service_opts.setOmeroGroup(-1)

    q = (
        """
        SELECT anno
        FROM %s obj
        JOIN obj.annotationLinks links
        JOIN links.child anno
        WHERE anno.class = MapAnnotation
        AND obj.id = :oid
        AND anno.ns = :ns
        """
        % obj_type
    )

    rows = qs.projection(q, params, service_opts)

    # TODO Throw Exception
    # assert len(rows) <= 1

    if len(rows) == 0:
        return None

    return rows[0][0].val


def _navigate_form_data_tree(key, data):
    if isinstance(data, dict):
        for k, v in data.items():
            compound_key = key or ""
            if key:
                compound_key = key + "_"
            for y in _navigate_form_data_tree(compound_key + k, v):
                yield y
    elif isinstance(data, list):
        for item in data:
            for y in _navigate_form_data_tree(key, item):
                yield y
    else:
        yield [str(key), str(data)]


def add_form_data_to_obj(conn, user_conn, form_id, obj_type, obj_id, data):
    """
    Get the key-values from the data and attach this to the object
    for conveniance
    """

    namespace = "hms.harvard.edu/omero/forms/kvdata/%s" % form_id

    # Extract key values from form data
    kvs = _navigate_form_data_tree(None, json.loads(data))

    # If the appropriate annotation already exists, delete it
    delete_form_kvdata(conn, form_id, obj_type, obj_id)

    # Create a new one
    map_ann = omero.gateway.MapAnnotationWrapper(user_conn)
    map_ann.setNs(namespace)
    map_ann.setValue(kvs)
    map_ann.save()

    if obj_type == "Project":
        link = omero.model.ProjectAnnotationLinkI()
        link.parent = omero.model.ProjectI(obj_id, False)
    elif obj_type == "Dataset":
        link = omero.model.DatasetAnnotationLinkI()
        link.parent = omero.model.DatasetI(obj_id, False)
    elif obj_type == "Screen":
        link = omero.model.ScreenAnnotationLinkI()
        link.parent = omero.model.ScreenI(obj_id, False)
    elif obj_type == "Plate":
        link = omero.model.PlateAnnotationLinkI()
        link.parent = omero.model.PlateI(obj_id, False)
    link.child = map_ann._obj

    update = user_conn.getUpdateService()
    update.saveObject(link, user_conn.SERVICE_OPTS)


def delete_form_kvdata(conn, form_id, obj_type, obj_id):
    """
    Delete the form key-value data annotation for the specified object type
    and id
    """

    anno = _get_form_kvdata(conn, form_id, obj_type, obj_id)

    if anno is None:
        return

    handle = conn.deleteObjects("MapAnnotation", [anno.id.val])
    cb = omero.callbacks.CmdCallbackI(conn.c, handle)

    while not cb.block(500):
        pass
    err = isinstance(cb.getResponse(), omero.cmd.ERR)
    if err:
        # TODO Throw exception
        pass
        # print cb.getResponse()
    cb.close(True)


def _marshal_group(conn, row):
    """ Given an ExperimenterGroup row (list) marshals it into a dictionary.
        Order and type of columns in row is:
          * id (rlong)
          * name (rstring)
          * permissions (dict)

        @param conn OMERO gateway.
        @type conn L{omero.gateway.BlitzGateway}
        @param row The Group row to marshal
        @type row L{list}
    """
    group_id, name, permissions = row
    group = dict()
    group["id"] = unwrap(group_id)
    group["name"] = unwrap(name)
    group["perm"] = unwrap(unwrap(permissions)["perm"])

    return group


def get_managed_groups(conn):
    """
    List of groups that the user can administer
    All groups for admins
    For other users, only groups of which they are the owner
    """

    service_opts = deepcopy(conn.SERVICE_OPTS)
    service_opts.setOmeroGroup(-1)
    params = omero.sys.ParametersI()

    qs = conn.getQueryService()
    q = """
        SELECT grp.id,
               grp.name,
               grp.details.permissions
        FROM ExperimenterGroup grp
        """

    if conn.isAdmin() is not True:
        user = conn.getUser()
        params.addLong("mid", user.getId())
        q += """
                JOIN grp.groupExperimenterMap grexp
                WHERE grp.name != 'user'
                AND grexp.child.id = :mid
                AND grexp.owner = true
                ORDER BY lower(grp.name)
             """

    groups = []
    for e in qs.projection(q, params, service_opts):
        groups.append(_marshal_group(conn, e[0:3]))
    return groups


def get_users(conn, user_ids):
    """
    Lookup user IDs and return usernames
    """

    params = omero.sys.ParametersI()
    service_opts = deepcopy(conn.SERVICE_OPTS)
    service_opts.setOmeroGroup(-1)
    params.addLongs("uids", user_ids)

    qs = conn.getQueryService()
    q = """
        SELECT user.id,
               user.omeName
        FROM Experimenter user
        WHERE user.id IN (:uids)
        ORDER BY lower(user.omeName)
        """

    rows = qs.projection(q, params, service_opts)

    for row in rows:
        yield {"id": row[0].val, "name": row[1].val}

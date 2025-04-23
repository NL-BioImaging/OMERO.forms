#!/usr/bin/env python
# -*- coding: utf-8 -*-

import logging
from django.apps import AppConfig

logger = logging.getLogger(__name__)


class FormsAppConfig(AppConfig):
    name = "omero_forms"
    label = "omero_forms"
    verbose_name = "OMERO.forms"
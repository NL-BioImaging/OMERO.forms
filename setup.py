#!/usr/bin/env python
# -*- coding: utf-8 -*-

import json
import os
from setuptools.command.build_py import build_py
from setuptools.command.install import install
from setuptools.command.sdist import sdist
from setuptools import setup, find_packages


# Utility function to read the README file. Also support json content
def read_file(fname, content_type=None):
    dir_path = os.path.dirname(os.path.realpath(__file__))
    p = os.path.join(dir_path, fname)
    with open(p) as f:
        if content_type in ("json",):
            data = json.load(f)
        else:
            data = f.read()
    return data


def read_version():
    d = read_file("package.json", "json")
    return d["version"]


VERSION = read_version()
DESCRIPTION = "OMERO forms app for enhanced metadata input and provenance"
AUTHOR = "D.P.W. Russell"
LICENSE = "AGPL-3.0"
HOMEPAGE = "https://github.com/sorgerlab/OMERO.forms"

REQUIREMENTS = [
    "omero-web>=5.6.0",
    "django>=3.2,<4.0"
]

PYTHON_REQUIRES = ">=3.7"


def require_npm(command, strict=False):
    """
    Decorator to run NPM prerequisites
    """

    class WrappedCommand(command):
        def run(self):
            if strict or not os.path.isdir(
                "omero_forms/static/forms/js"
            ):
                self.spawn(["npm", "install"])
                self.spawn(["npm", "run", "build"])
            command.run(self)

    return WrappedCommand


setup(
    name="omero-forms",
    packages=find_packages(),
    version=VERSION,
    description=DESCRIPTION,
    long_description=read_file("README.rst"),
    classifiers=[
        "Development Status :: 5 - Production/Stable",
        "Environment :: Web Environment",
        "Framework :: Django",
        "Intended Audience :: End Users/Desktop",
        "Intended Audience :: Science/Research",
        "License :: OSI Approved :: GNU Affero General Public License v3",
        "Natural Language :: English",
        "Operating System :: OS Independent",
        "Programming Language :: JavaScript",
        "Programming Language :: Python :: 3",
        "Topic :: Internet :: WWW/HTTP",
        "Topic :: Internet :: WWW/HTTP :: Dynamic Content",
        "Topic :: Internet :: WWW/HTTP :: WSGI",
        "Topic :: Scientific/Engineering :: Visualization",
        "Topic :: Software Development :: Libraries :: " "Application Frameworks",
        "Topic :: Text Processing :: Markup :: HTML",
    ],
    author=AUTHOR,
    author_email="dpwrussell@gmail.com",
    license=LICENSE,
    url=HOMEPAGE,
    download_url="%s/archive/%s.tar.gz" % (HOMEPAGE, VERSION),
    keywords=["OMERO.web", "forms", "provenance", "history"],
    install_requires=[
        'omero-web>=5.6.0',
        'django>=3.2,<4.0',
    ],
    python_requires='>=3.7',
    package_data={
        "omero_forms": [
            "static/forms/js/*",
            "static/forms/js/*.js",
            "templates/forms/*",
            "templates/forms/*.html",
            "templates/*/*",
        ],
    },
    include_package_data=True,
    zip_safe=False,
    cmdclass={
        "build_py": require_npm(build_py),
        "install": require_npm(install),
        "sdist": require_npm(sdist, True),
    },
)

import os
import shutil
import subprocess
import sys
import json
from setuptools import build_meta as _orig
from setuptools.build_meta import *


def _run_npm_build():
    """Run npm install and build"""
    # Create directory if it doesn't exist
    os.makedirs("omero_forms/static/forms/js", exist_ok=True)
    # On Windows, npm is a .cmd script and needs shell=True
    # to be resolved by subprocess
    use_shell = sys.platform == "win32"
    subprocess.check_call(
        ["npm", "install", "--legacy-peer-deps"], shell=use_shell)
    subprocess.check_call(["npm", "run", "build"], shell=use_shell)


def get_requires_for_build_sdist(config_settings=None):
    """Run npm build before sdist requirements check"""
    _run_npm_build()
    return _orig.get_requires_for_build_sdist(config_settings)


def get_requires_for_build_wheel(config_settings=None):
    """Run npm build before wheel requirements check"""
    _run_npm_build()
    return _orig.get_requires_for_build_wheel(config_settings)


def build_wheel(wheel_directory, config_settings=None, metadata_directory=None):
    return _orig.build_wheel(wheel_directory, config_settings, metadata_directory)


def build_sdist(sdist_directory, config_settings=None):
    return _orig.build_sdist(sdist_directory, config_settings)


def build_editable(wheel_directory, config_settings=None, metadata_directory=None):
    return _orig.build_editable(wheel_directory, config_settings, metadata_directory)

import logging
import os

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.template.defaultfilters import slugify

import participants.models as pm
import venues.models as vm
from draw.models import DebateTeam
from importers import DUPLICATE_INFO, importer_registry, TournamentDataImporterFatal


import argparse

from .models import Tournament


parser = argparse.ArgumentParser(description='Delete all data for a tournament and import from specified directory.')

parser.add_argument('path', help="Directory to import tournament data from")
parser.add_argument('items', help="Items to import (default: import all)", nargs="*", default=[])

parser.add_argument('-e', '--encoding', type=str, default='utf-8',
                    help="Encoding used in the CSV files (default: utf-8)")
parser.add_argument('-i', '--importer', type=str, default=None, choices=importer_registry,
                    help="Which importer to use (default: read from .importer file)")

parser.add_argument('--force', action='store_true', default=False,
                    help="Do not prompt before deleting tournament that already exists.")
parser.add_argument('--keep-existing', action='store_true', default=False,
                    help="Keep existing tournament and data, skipping lines if they are duplicates.")
parser.add_argument('--relaxed', action='store_false', dest='strict', default=True,
                    help="Don't crash if there is an error, just skip and keep going.")

# Cleaning shared objects
parser.add_argument('--clean-shared', action='store_true', default=False,
                    help="Delete all shared objects from the database. Overrides --keep-existing.")
parser.add_argument('--delete-institutions', action='store_true', default=False,
                    help="Delete all institutions from the database. Overrides --keep-existing.")
parser.add_argument('--delete-venue-categories', action='store_true', default=False,
                    help="Delete all venue categories from the database. Overrides --keep-existing.")
parser.add_argument('--delete-regions', action='store_true', default=False,
                    help="Delete all regions categories from the database. Overrides --keep-existing.")

# Tournament options
parser.add_argument('-s', '--slug', type=str, action='store', default=None,
                    help="Override tournament slug. (Default: use name of directory.)")
parser.add_argument('--name', type=str, action='store', default=None,
                    help="Override tournament name. (Default: use name of directory.)")
parser.add_argument('--short-name', type=str, action='store', default=None,
                    help="Override tournament short name. (Default: use name of directory.)")

# API settings
parser.add_argument('-u', '--url', type=str, action='store', required=True,
                    help="Override tournament slug. (Default: use name of directory.)")
parser.add_argument('-k', '--key', type=str, action='store', default=None,
                    help="Override tournament name. (Default: use name of directory.)")

options = parser.parse_args()
auth_keys = {'api_url': options['url'], 'token': options['key']}


dirpath = get_data_path(options['path'])

clean_shared_instances()
tournament = make_tournament()

importer_class = get_importer_class()
importer = importer_class(
    tournament, loglevel=loglevel, strict=options['strict'], expect_unique=not options['keep_existing'])

# Importer classes specify what they import, and in what order
for item in importer.order:
    make(item)

def get_importer_class():
    importer_spec_filepath = os.path.join(dirpath, ".importer")
    importer_spec_arg = options['importer']

    if not os.path.exists(importer_spec_filepath) and importer_spec_arg is None:
        raise CommandError("The --importer option wasn't specified and the file "
            "%s does not exist." % importer_spec_filepath)

    if os.path.exists(importer_spec_filepath):
        try:
            f = open(importer_spec_filepath, 'r', encoding=options['encoding'])
        except OSError as e:
            raise CommandError("Error opening file %s: %s" % (importer_spec_filepath, e))
        importer_spec = f.read().strip()
    else:
        importer_spec = None

    if importer_spec_arg is not None:
        if importer_spec is not None and importer_spec_arg != importer_spec:
            _warning("Using importer %s, but data directory suggests "
                    "%s" % (importer_spec_arg, importer_spec))
        importer_spec = importer_spec_arg

    if importer_spec not in importer_registry:
        raise CommandError("There is no importer %r." % importer_spec)

    return importer_registry[importer_spec]

def _print_stage(message):
    if verbosity > 0:
        if color:
            message = "\033[0;36m" + message + "\033[0m\n"
        stdout.write(message)

def _print_result():
    if verbosity > 0:
        counts = importer.counts
        errors = importer.errors
        if errors:
            for message in errors.itermessages():
                if color:
                    message = "\033[1;32m" + message + "\033[0m\n"
                stdout.write(message)
        count_strs = ("{1:d} {0}".format(model._meta.verbose_name_plural, count) for model, count in counts.items())
        message = "Imported " + ", ".join(count_strs) + ", hit {1:d} errors".format(counts, len(errors))
        if color:
            "\033[0;36m" + message + "\033[0m\n"
        stdout.write(message)

def _warning(message):
    if verbosity > 0:
        if color:
            message = "\033[0;33mWarning: " + message + "\033[0m\n"
        stdout.write(message)

def _print_loud(message):
    if color:
        message = "\033[1;33m" + message + "\033[0m\n"
    stdout.write(message)

def _csv_file_path(filename):
    """Requires dirpath to be defined."""
    if not filename.endswith('.csv'):
        filename += '.csv'
    return os.path.join(dirpath, filename)

def _open_csv_file(filename):
    """Requires dirpath to be defined."""
    path = _csv_file_path(filename)
    try:
        return open(path, 'r', encoding=options['encoding'])
    except OSError as e:
        _warning("Skipping '{0:s}': {1:s}".format(filename, e.strerror))
        return None

def make(model):
    """Imports objects of the specified model, by calling the import_<model>
    method to import from the file <model>.csv."""
    if options['items'] and model not in options['items']:
        return
    f = _open_csv_file(model)
    import_method = getattr(importer, 'import_' + model)
    if f is not None:
        _print_stage("Importing %s.csv" % model)
        importer.reset_counts()
        try:
            import_method(f)
        except TournamentDataImporterFatal as e:
            raise CommandError(e)
        _print_result()

def get_data_path(arg):
    """Returns the directory for the given command-line argument. If the
    argument is an absolute path and is a directory, then looks there.
    Failing that, looks in the debate/data directory. Raises an exception
    if the directory doesn't appear to exist, or is not a directory."""
    def _check_return(path):
        if not os.path.isdir(path):
            raise CommandError("The path '%s' is not a directory" % path)
        stdout.write('Importing from directory: ' + path)
        return path

    if os.path.isabs(arg):  # Absolute path
        return _check_return(arg)

    # relative path, look in debate/data
    base_path = os.path.join(settings.BASE_DIR, '..', 'data')
    data_path = os.path.join(base_path, arg)
    return _check_return(data_path)

def clean_shared_instances():
    """Removes shared instances from the database, depending on what options
    the user selected."""
    if options['clean_shared'] or options['delete_institutions']:
        _warning("Deleting all institutions from the database")
        pm.Institution.objects.all().delete()

    if options['clean_shared'] or options['delete_venue_categories']:
        _warning("Deleting all room categories from the database")
        vm.VenueCategory.objects.all().delete()

    if options['clean_shared'] or options['delete_regions']:
        _warning("Deleting all regions from the database")
        pm.Region.objects.all().delete()

def make_tournament():
    """Given the path, does everything necessary to create the tournament,
    and sets tournament to be the newly-created tournament.
    """
    slug, name, short_name = resolve_tournament_fields()
    existing = check_existing_tournament(slug)
    return create_tournament(existing, slug, name, short_name)

def resolve_tournament_fields():
    """Figures out what the tournament slug, name and short name should be,
    and returns the three as a 3-tuple.
    """
    basename = str(os.path.basename(dirpath.rstrip('/')))
    name = options['name'] or basename
    short_name = options['short_name'] or (basename[:24] + '..' if len(basename) > 24 else basename)
    slug = options['slug'] or slugify(basename)
    return slug, name, short_name

def check_existing_tournament(slug):
    """Checks if a tournament exists. If --keep-existing was not used,
    deletes it. If it was used, and the tournament does not exist, raises
    and error."""
    tournaments = [t for t in Tournament(**auth_keys).all() if t['slug'] == slug]
    exists = len(tournaments) > 0
    if exists:
        tournament = tournaments[0]
        if not options['keep_existing'] and not options['items']:
            if not options['force']:
                _print_loud("WARNING! A tournament with slug '" + slug + "' already exists.")
                _print_loud("You are about to delete EVERYTHING for this tournament.")
                response = input("Are you sure? (yes/no) ")
                if response != "yes":
                    raise CommandError("Cancelled by user.")
            tournament.delete()
        else:
            return tournament

    elif not exists and options['keep_existing']:
        raise CommandError("Used --keep-existing, but tournament %r does not exist" % slug)

def create_tournament(existing, slug, name, short_name):
    """Creates, saves and returns a tournament with the given slug.
    Raises exception on error."""
    if existing:
        return existing

    _print_stage("Creating tournament %r" % slug)
    return Tournament(**auth_keys, name=name, short_name=short_name, slug=slug).save()
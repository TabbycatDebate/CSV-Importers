.. _tournament-data-importers:

=========================
Tournament Data Importers
=========================

This page describes how to write your own tournament data importer. It is aimed at an audience that is familiar with programming in Python, and may be willing to get their head around the Django model if necessary.

The **tournament data importer** is the class that imports data from one or more files (usually CSV files) into the database. A base class ``BaseTournamentDataImporter`` is in `importer/base.py <https://github.com/TabbycatDebate/tabbycat/blob/develop/importer/base.py>`_. An example of a data importer is in `importer/anorak.py <https://github.com/TabbycatDebate/tabbycat/blob/develop/importer/anorak.py>`_.

.. todo:: This page is incomplete. If you're finding this information insufficient, please contact Chuan-Zheng using the contact details in the :ref:`authors` section.

Why write your own?
===================

While Tabbycat has standard import formats, you might find that none of them fit the data that you need to import.

It's not possible to devise a single, universally-convenient import file format. Tabbycat supports way too many permutations of configurations for this to be workable. Instead, we provide the ones that have been useful before and are therefore likely to be useful again—but if your tournament has different needs, you might decide that it's easier to write an importer to conform to you, rather than conform to the importer.

A base importer class abstracts away most of the nitty-gritty of parsing files, allowing new importers to focus on their interpretation with as little code as possible.

To allow new importers to be written with as little code as possible, most of the work is abstracted to the base class. The flipside of this abstraction is that it induces a learning curve.

Basic workflow
==============

1. Choose a name. We name importers after items of clothing in alphabetical order (starting at 'Anorak').
2. Write a subclass of ``BaseTournamentDataImporter``.
3. Write the front-end interface. This will probably be a `Django management command <https://docs.djangoproject.com/en/1.9/howto/custom-management-commands/>`_.

A basic example
===============

It's easiest to start with an example. Here's a basic importer with just one import method,
which imports adjudicators.

.. code:: python

    from .base import BaseTournamentDataImporter, make_lookup, make_interpreter
    from participants.models import Person, Adjudicator

    class ExampleTournamentDataImporter(BaseTournamentDataImporter):

        lookup_gender = make_lookup("gender", {
            ("male", "m"): Person.GENDER_MALE,
            ("female", "f"): Person.GENDER_FEMALE,
            ("other", "o"): Person.GENDER_OTHER,
        })

        def import_adjudicators(self, f):
            """Imports adjudicators. `f` is a file object."""
            interpreter = make_interpreter(
                institution=Institution.objects.lookup,
                gender=self.lookup_gender,
                tournament=self.tournament
            )
            counts, errors = self._import(f, Adjudicator, interpreter)
            return counts, errors

Let's break this down. The method ``import_adjudicators()`` takes a single
argument, a file object representing the CSV file. Most of the work is
passed off to ``self._import()``. This helper method is defined in
``BaseTournamentDataImporter`` and is where most of the intelligence lies.

When called, ``self._import(f, model, interpreter)`` does the following:

1. It reads the CSV file using a `csv.DictReader
   <https://docs.python.org/3/library/csv.html#csv.DictReader>`_. A
   ``DictReader`` iterates through the CSV file, yielding a dict for each line,
   whose keys are given by the column header names in the first row of the file.

2. On each line:

  a. It passes the dict given by the ``DictReader`` to ``interpreter``. The
     interpreter modifies the dict (or creates a new one) to prepare it for the
     model constructor, and returns it.

  b. The dict returned by ``interpreter`` is then passed as keyword arguments to
     the ``model`` constructor.

So in very simplified form, ``self._import(f, model, interpreter)`` does this:

  .. code:: python

    def _import(self, f, model, interpreter):
        reader = csv.DictReader(f)
        for line in reader:
            kwargs = interpreter(line)
            inst = model(**kwargs)
            inst.save()

(There's a lot more to it than that, but that's the basic idea.)

.. important:: A consequence of relying on column headers to identify fields is
  that the header names in CSV files must match model field names exactly,
  unless they are deleted by the interpreter using the ``DELETE`` keyword (see
  below).

Interpreters
============
The main task of an importer, then, is to provide interpreters so that ``self._import``
knows how to interpret the data in a CSV file. An interpreter takes a dict and
returns a dict. For example:

.. code:: python

    def interpreter(line):
        line['institution'] = Institution.objects.lookup(line['institution'])
        line['gender'] = self.lookup_gender(line['gender'])
        line['tournament'] = self.tournament
        return line

This interpreter does the following:

- Replaces ``line['institution']`` with an Institution object, by looking
  up the original value by name.
- Replaces ``line['gender']`` with a ``Person.GENDER_*`` constant. We'll come
  back to how this works later.
- Adds a new ``line['tournament']`` entry to the dict, being the Tournament
  object represented by ``self.tournament``, the tournament that was passed
  to the importer's constructor.
- Leaves all other entries in the dict unchanged.

This looks simple enough, but it's very robust. What if a cell in the CSV file
is blank, or what if the file omits a column? (For example, some tournaments
might not collect information about participant gender, so Tabbycat doesn't
require it.) We could deal with these scenarios on a case-by-case basis, but
that's cumbersome.

Instead, we provide a ``make_interpreter`` method that returns an interpreter
method which, in turn, takes care of all these details. This way, all you have
to do is provide the functions that transform fields. So the following is
equivalent to the above, but better:

.. code:: python

    interpreter = make_interpreter(
        institution=Institution.objects.lookup,
        gender=self.lookup_gender,
        tournament=self.tournament
    )

Notice that we provided a callable in two of these keyword arguments, and a
(non-callable) Tournament object to the third. ``make_interpreter`` is smart
enough to tell the difference, and treat them differently. What it does with
each field depends on (a) whether a value exists in the CSV file and (b) what
transformation function was provided, as summarised in the following table:

+-------------------------+----------------+-----------------------------------+
|    Value in CSV file    | Transformation |               Action              |
+=========================+================+===================================+
|                         | provided and   | populate model field              |
|                         | not callable   | with interpreter value            |
+-------------------------+----------------+-----------------------------------+
| does not exist or blank | callable or    | do not pass to model constructor  |
|                         | not provided   |                                   |
+-------------------------+----------------+-----------------------------------+
| exists and not blank    | callable       | call interpreter on column value, |
|                         |                | pass result to model constructor  |
+-------------------------+----------------+-----------------------------------+
| exists and not blank    | not provided   | pass column value directly        |
|                         |                | to model constructor              |
+-------------------------+----------------+-----------------------------------+

.. tip::

  .. rst-class:: spaced-list

  - If a transformation isn't an existing method, you might find
    `lambda functions <https://docs.python.org/2/tutorial/controlflow.html#lambda-expressions>`_
    useful. For example: ``lambda x: Speaker.objects.get(name=x)``.

  - You shouldn't check for mandatory fields. If a mandatory field is omitted,
    the model constructor will throw an error, and ``self._import()`` will catch
    the error and pass a useful message on to the caller. On the other hand, if
    it's an optional field in the model, it should optional in the importer,
    too. Similarly, interpreters generally shouldn't specify defaults; these
    should be left to model definitions.

  - You don't need to include interpreter transformations for things like
    converting strings to integers, floats or booleans. Django converts strings
    to appropriate values when it instantiates models. So, for example, adding
    ``test_score=float`` to the above interpreter would be redundant.

More complicated interpreters
-----------------------------

If you have a column in the CSV file that shouldn't be passed to the model
constructor, you can tell the interpreter to remove it by using the special
``DELETE`` argument:

.. code:: python

    interpreter = make_interpreter(
        institution=Institution.objects.lookup,
        DELETE=['unwanted_column_1', 'unwanted_column_2']
    )

The ``make_interpreter`` can only deal with modifications where each field is
modified separately of the others (or not at all). If you want to combine
information from multiple fields, you need to write your interpreter the long
way (perhaps calling a function returned by ``make_interpreter`` to do some of
the work).

On the other hand, if you don't need to do any transformations involving some
sort of object or constant lookup, then you can just omit the ``interpreter``
argument of ``self._lookup()``, and it'll just leave the fields as-is.

Lookup functions
================
In the above example, we used a function ``self.lookup_gender`` to convert from
the text in the CSV file to a ``Person.GENDER_*`` constant. To make this easier,
the importer provides a convenience function to define such lookup functions.
Let's look at the relevant lines again:

.. code:: python

    lookup_gender = make_lookup("gender", {
        ("male", "m"): Person.GENDER_MALE,
        ("female", "f"): Person.GENDER_FEMALE,
        ("other", "o"): Person.GENDER_OTHER,
    })

This should be a member of your subclass, in our case,
``ExampleTournamentDataImporter``. It generates a function that looks something
like:

.. code:: python

    @staticmethod
    def lookup_gender(val):
        if val in ("male", "m"):
            return Person.GENDER_MALE
        elif val in ("female", "m"):
            return Person.GENDER_FEMALE
        elif val in ("other", "o"):
            return Person.GENDER_OTHER
        else:
            raise ValueError("Unrecognised value for gender: %s" % val)

The ``make_lookup`` function takes two arguments. The first is a text
description of what it's looking up; this is used for the error message if the
value in the CSV file isn't recognised. The second is a dict mapping tuples
of valid strings to constants.

Debugging output
================

The ``BaseTournamentDataImporter`` constructor accepts a ``loglevel`` argument:

.. code:: python

  importer = MyTournamentDataImporter(tournament, loglevel=logging.DEBUG)

If ``loglevel`` is set to ``logging.DEBUG``, the importer will print information
about every instance it creates.

You can also pass in a logger for it to use (instead of the default one) with
the ``logger`` argument.

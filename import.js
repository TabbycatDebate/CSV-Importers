let processList = document.getElementById("activity");

const BOOLEANS = {
	'true': true,
	'yes': true,
	't': true,
	'y': true,
	'1': true,
	'false': false,
	'no': false,
	'f': false,
	'n': false,
	'0': false
}

const ROUND_STAGES = {
	"preliminary": "P",
	"p": "P",
	"elimination": "E",
	"break": "E",
	"e": "E",
	"b": "E"
}

const DRAW_TYPES = {
	"random": "R",
	"r": "R",
	"manual": "M",
	"m": "M",
	"round robin": "D",
	"d": "D",
	"power paired": "P",
	"p": "P",
	"elimination": "E",
	"break": "E",
	"e": "E",
	"b": "E"
}

const GENDERS = {
	"male": "M",
	"m": "M",
	"female": "F",
	"f": "F",
	"other": "O",
	"o": "O"
}

const TEAM_POSITIONS = {
	"affirmative": "aff",
	"aff": "aff",
	"a": "aff",
	"negative": "neg",
	"neg": "neg",
	"n": "neg"
}

const ANSWER_TYPES = {
	"checkbox": "bc",
	"yes no select": "bs",
	"yesno": "bs",
	"integer textbox": "i",
	"int": "i",
	"integer": "i",
	"integer scale": "is",
	"scale": "is",
	"float": "f",
	"text": "t",
	"textbox": "tl",
	"long text": "tl",
	"longtext": "tl",
	"select single": "ss",
	"single select": "ss",
	"select multiple": "ms",
	"multiple select": "ms"
}

const VENUE_CATEGORY_DISPLAYS = {
	"": "S",
	"suffix": "S",
	"prefix": "P"
}

const fileNames = {
	"adj_feedback_questions": "feedback-questions",
	"adj_venue_constraints": null,
	"adjudicator_conflicts": null,
	"adjudicators": "adjudicators",
	"break_categories": "break-categories",
	"institution_conflicts": null,
	"institutions": "institutions",
	"motions": "motions",
	"rounds": "rounds",
	"scores": null,
	"speaker_categories": "speaker-categories",
	"speakers": null,
	"team_conflicts": null,
	"team_venue_constraints": null,
	"teams": "teams",
	"venue_categories": "venue-categories",
	"venues": "venues"
}

let created = (key, value, dict) => (r) => {
	dict[key][value] = r.url;
	let li = document.createElement("li");
	li.innerText = "Created " + r[value];
	processList.appendChild(li);
};

let insertFromCSV = (formData, tournamentData, file, value, cb = (_,r) => r) => {
	Papa.parse(file, {
		headers: true,
		dynamicTyping: true,
		step: (r, parser) => {
			let data = cb(tournamentData, r.data);

			fetch(tournamentData['tournament'] + "/" + fileNames[file.name.slice(0, -4)], {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': 'Token ' + formData.get('api-token')
				},
				body: JSON.stringify(data),
			}).then(response => response.json())
			.then(created(file.name.slice(0, -4), value, tournamentData))
			.catch(error => console.error('Error:', error));
		}
	});
};

let importFeedbackQuestion = (tournamentData, r) => {
	r.answer_type = ANSWER_TYPES[r.answer_type];
	r.required = BOOLEANS[r.required];
	r.from_team = BOOLEANS[r.from_team];
	r.from_adj = BOOLEANS[r.from_adj];
	r.choices = r.choices.split('//');
	return r;
};

let importAdjudicator = (tournamentData, r) => {
	r.institution = tournamentData.institutions[r.institution];
	r.adj_core = BOOLEANS[r.adj_core];
	r.independent = BOOLEANS[r.independent];
	return r;
};

let importBreakCategory = (tournamentData, r) => {
	r.is_general = BOOLEANS[r.is_general];
	return r;
};

let importMotion = (tournamentData, r) => {
	r.rounds = {"round": tournamentData.rounds[r.rounds], "seq": r.seq};
	delete r.seq;
	return r;
}

let importRound = (tournamentData, r) => {
	r.stage = ROUND_STAGES[r.stage];
	r.silent = BOOLEANS[r.silent];
	r.draw_type = DRAW_TYPES[r.draw_type];
	r.break_category = tournamentData.break_categories[r.break_category];
	return r;
};

let importSpeakerCategories = (tournamentData, r) => {
	r.public = BOOLEANS[r.public];
	return r;
}

let importVenueCategory = (tournamentData, r) => {
	r.venues = [];
	r.display_in_venue_name = VENUE_CATEGORY_DISPLAYS[r.display_in_venue_name];
	return r;
};

let importVenue = (tournamentData, r) => {
	r.categories = [tournamentData.venue_categories[r.category]];
	delete r.category;
	return r;
};

let anorakImporter = (data, tournamentData) => {
	let files = {};
	for (file in data.getAll("csvs"))
		files[file.name.slice(0, -4)] = file;

	let object_types = [
		['venue_categories', 'name', importVenueCategory],
		['venues', 'name', importVenue],
		['institutions', 'code'],
		['break_categories', 'slug', importBreakCategory],
		'teams',
		'speakers',
		['adjudicators', 'name', importAdjudicator],
		['rounds', 'abbreviation', importRound],
		['motions', 'reference', importMotion],
		'sides',
		['adj_feedback_questions', 'reference', importFeedbackQuestion],
		'adj_venue_constraints',
		'team_venue_constraints',
	].forEach(t => {
		if (typeof t === 'array') {
			insertFromCSV(data, tournamentData, files[t[0]], t[1], t[2] ?? (_, r) => r);
		} else {
			//
		}
	});
};

let bootsImporter = (data, tournamentData) => {
	let object_types = [
		['break_categories', 'slug', importBreakCategory],
		['rounds', 'abbreviation', importRound],
		['institutions', 'code'],
		['speaker_categories', 'slug', importSpeakerCategories],
		['adjudicators', 'name', importAdjudicator],
		'scores',
		'teams',
		['venues', 'name', importVenue],
		'team_conflicts',
		'institution_conflicts',
		'adjudicator_conflicts',
		'team_institution_conflicts',
		['adj_feedback_questions', 'reference', importFeedbackQuestion],
		['motions', 'reference', importMotion]
	].forEach(t => {
		if (typeof t === 'array') {
			insertFromCSV(data, tournamentData, files[t[0]], t[1], t[2] ?? (_, r) => r);
		} else {
			//
		}
	});
};

let importTournament = (e) => {
	e.preventDefault();

	let data = new FormData(document.getElementById("import-form"));
	let tournamentData = {
		'tournament': null,
		'break_categories': {},
		'venue_categories': {}
	};

	switch (data.get('method')) {
		case 'anorak':
			anorakImporter(data, tournamentData);
			break;
		case 'boots':
			bootsImporter(data, tournamentData);
			break;
		default:
			anorakImporter(data, tournamentData);
			break;
	}
};

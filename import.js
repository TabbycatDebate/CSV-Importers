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
	"speakers": "speakers",
	"team_conflicts": null,
	"team_venue_constraints": null,
	"teams": "teams",
	"venue_categories": "venue-categories",
	"venues": "venues"
}

let importFeedbackQuestion = (tournamentData, r) => {
	r.answer_type = ANSWER_TYPES[r.answer_type];
	r.required = BOOLEANS[r.required];
	r.from_team = BOOLEANS[r.from_team];
	r.from_adj = BOOLEANS[r.from_adj];
	r.choices = r.choices.split('//');
	return r;
};

let importInstitution = (tournamentData, r) => {
	let url = tournamentData.tournament.split('/').slice(0, -2);
	url.push('institutions');
	r._url = url.join('/');
	return r;
};

let importAdjudicator = (tournamentData, r) => {
	r.institution = tournamentData.institutions?.[r.institution];
	r.adj_core = BOOLEANS[r.adj_core];
	r.independent = BOOLEANS[r.independent];
	return r;
};

let importBreakCategory = (tournamentData, r) => {
	r.is_general = BOOLEANS[r.is_general];
	return r;
};

let importMotion = (tournamentData, r) => {
	r.rounds = {"round": tournamentData.rounds?.[r.rounds], "seq": r.seq};
	delete r.seq;
	return r;
}

let importRound = (tournamentData, r) => {
	r.stage = ROUND_STAGES[r.stage];
	r.silent = BOOLEANS[r.silent];
	r.draw_type = DRAW_TYPES[r.draw_type];
	r.break_category = tournamentData.break_categories?.[r.break_category];
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
	r.categories = [...(tournamentData.venue_categories?.[r.category] ?? [])];
	delete r.category;
	return r;
};

let importTeams = (tournamentData, r) => {
	let team = {
		institution: tournamentData.institutions?.[r.institution] ?? null,
		break_categories: (r.break_category ?? '').split(";").map(c => tournamentData.break_categories[c]),
		institution_conflicts: (r.institution_conflicts ?? '').split(";").map(c => tournamentData.institutions[c]),
		reference: r.reference,
		code_name: r.code_name,
		emoji: r.emoji,
		speakers: [],
	};
	team.use_institution_prefix = BOOLEANS[r.use_institution_prefix] ?? bool(team.institution);

	let i = 1;
	while (r[`speaker${i}_name`]) {
		team.speakers.push({
			name: r[`speaker${i}_name`],
			email: r[`speaker${i}_email`],
			phone: r[`speaker${i}_phone`],
			anonymous: BOOLEANS[r[`speaker${i}_anonymous`]] ?? false,
			code_name: r[`speaker${i}_code_name`],
			url_key: r[`speaker${i}_url_key`],
			gender: GENDERS[r[`speaker${i}_gender`]] ?? '',
			pronoun: r[`speaker${i}_pronoun`],
			categories: (r[`speaker${i}_category`] ?? '').split(";").map(c => tournamentData.speaker_categories?.[c]),
		});
	};
	return team;
};

let importSpeakers = (tournamentData, r) => {
	return {
		team: Object.values(tournamentData.teams).filter(
			t => t.reference === r.team_name &&
			t.institution === tournamentData.institutions?.[r.institution] &&
			t.use_institution_prefix === (BOOLEANS[r.use_institution_prefix] ?? false)
		)[0],
		name: r.name,
		email: r.email,
		phone: r.phone,
		anonymous: BOOLEANS[r.anonymous] ?? false,
		code_name: r.code_name,
		url_key: r.url_key,
		gender: r.gender,
		pronoun: r.pronoun,
		categories: (r.category ?? '').split(";").map(c => tournamentData.speaker_categories?.[c]),
	};
};

let importAdjScores = (tournamentData, r) => {
	return {
		_method: 'PATCH',
		_url: tournamentData.adjudicators?.[r.adjudicator],
		base_score: r.score,
	};
};

let importAdjVenueConstraints = (tournamentData, r) => {
	return {
		_method: 'PATCH',
		_url: tournamentData.adjudicators?.[r.adjudicator],
		venue_constraints: [{
			category: tournamentData.venue_categories?.[r.category],
			priority: r.priority,
		}],
	};
};

let importTeamVenueConstraints = (tournamentData, r) => {
	return {
		_method: 'PATCH',
		_url: tournamentData.teams[r.team],
		venue_constraints: [{
			category: tournamentData.venue_categories?.[r.category],
			priority: r.priority,
		}],
	};
};

let importTeamConflicts = (tournamentData, r) => {
	return {
		_method: 'PATCH',
		_url: tournamentData.adjudicators?.[r.adjudicator],
		team_conflicts: [tournamentData.teams?.[r.team]],
	};
};

let importInstitutionConflicts = (tournamentData, r) => {
	return {
		_method: 'PATCH',
		_url: tournamentData.adjudicators?.[r.adjudicator],
		team_conflicts: [tournamentData.institutions?.[r.institution]],
	};
};

let importAdjudicatorConflicts = (tournamentData, r) => {
	return {
		_method: 'PATCH',
		_url: tournamentData.adjudicators?.[r.adjudicator1],
		team_conflicts: [tournamentData.adjudicators?.[r.adjudicator2]],
	};
};

let importTeamInstitutionConflicts = (tournamentData, r) => {
	return {
		_method: 'PATCH',
		_url: tournamentData.teams?.[r.team],
		team_conflicts: [tournamentData.institutions?.[r.institution]],
	};
};

let created = (key, value, dict) => (r) => {
	dict[key][r[value]] = r.url;
	let li = document.createElement("li");
	li.innerText = "Created " + r[value];
	processList.appendChild(li);
};

let insertFromCSV = (formData, tournamentData, file, value, cb) => {
	if (!file) {
		return;
	}
	tournamentData[file.name.slice(0, -4)] = {};
	Papa.parse(file, {
		header: true,
		dynamicTyping: true,
		skipEmptyLines: 'greedy',
		step: (r, parser) => {
			let { _method, _url, ...body } = cb(tournamentData, r.data);

			const url = _url ?? tournamentData.tournament + "/" + fileNames[file.name.slice(0, -4)];
			const method = _method ?? 'POST';

			fetch(url, {
				method,
				headers: {
					'Content-Type': 'application/json',
					'Authorization': 'Token ' + formData.get('api-token')
				},
				body: JSON.stringify(body),
			}).then(response => response.json())
			.then(created(file.name.slice(0, -4), value, tournamentData))
			.catch(error => console.error('Error:', error));
		}
	});
};

let fullImporter = async (data, tournamentData) => {
	let files = {};
	for (const file of data.getAll("csvs"))
		files[file.name.slice(0, -4)] = file;

	let object_types = [
		['venue_categories', 'name', importVenueCategory],
		['venues', 'name', importVenue],
		['institutions', 'code', importInstitution],
		['break_categories', 'slug', importBreakCategory],
		['speaker_categories', 'slug', importSpeakerCategories],
		['teams', 'reference', importTeams],
		['speakers', 'name', importSpeakers],
		['adjudicators', 'name', importAdjudicator],
		['scores', null, importAdjScores],
		['rounds', 'abbreviation', importRound],
		['motions', 'reference', importMotion],
		'sides',
		['adj_feedback_questions', 'reference', importFeedbackQuestion],
		['adj_venue_constraints', null, importAdjVenueConstraints],
		['team_venue_constraints', null, importTeamVenueConstraints],
		['team_conflicts', null, importTeamConflicts],
		['institution_conflicts', null, importInstitutionConflicts],
		['adjudicator_conflicts', 'adjudicator1', importAdjudicatorConflicts],
		['team_institution_conflicts', null, importTeamInstitutionConflicts],
	].forEach(t => {
		if (Array.isArray(t)) {
			insertFromCSV(data, tournamentData, files[t[0]], t[1], t[2]);
		} else {
			// 'sides' not supported
		}
	});
};

let importTournament = async (data) => {
	const url = new URL(data.get('url'));
	// Test if tournament already exists
	const getRequest = await fetch(url.protocol + "//" + url.host + "/api/v1/tournaments/" + data.get('slug'), {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': 'Token ' + data.get('api-token')
		},
	})
	if (getRequest.ok) {
		return (await getRequest.json()).url;
	}

	// Create tournament
	const createRequest = await fetch(url.protocol + "//" + url.host + "/api/v1/tournaments", {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': 'Token ' + data.get('api-token')
		},
		body: JSON.stringify({
			'name': data.get('tournament'),
			'slug': data.get('slug'),
			'active': true
		})
	});
	return (await createRequest.json()).url;
};

document.querySelector("form").addEventListener("submit", async (e) => {
	e.preventDefault();

	let data = new FormData(document.querySelector("form"));
	let tournamentData = {
		'tournament': await importTournament(data),
	};
	await fullImporter(data, tournamentData);
});

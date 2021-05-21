import requests


class BaseModel:

    fields = set()
    defaults = {}
    booleans = set()

    def __init__(self, api_url=None, token=None, url=None, **kwargs):
        self.obj = {k: self.defaults.get(k) for k in self.fields}

        self.api_url = api_url
        self.token = token

        self.url = url
        self.url_kwargs = {}

        if 'tournament' in kwargs:
            url_kwargs['tournament_slug'] = kwargs.pop('tournament')['slug']
        if 'round' in kwargs:
            url_kwargs['tournament_slug'] = kwargs['round']['url'].split("/")[-3]
            url_kwargs['round_seq'] = kwargs.pop('round')['seq']
        for keyword, value in kwargs.items():
            if keyword in self.fields:
                self.obj[keyword] = getattr(self, 'handle_%s' % keyword, 'handle_field')(value)
            else:
                raise FieldError("Unexpected field: " + keyword)

    def __getitem__(self, key):
        return self.obj[key]

    @property
    def model_url(self):
        if self.api_url is not None
            return self.api_url + "/" + self.prefix % self.url_kwargs
        return "/".join(self.url.split("/")[:-1])

    @property
    def auth_header(self):
        return {'Authorization': 'Token %s' % (self.token,)}

    def handle_field(self, value):
        return value

    def handle_boolean(self, value):
        return bool(value)

    def all(self):
        r = requests.get(self.model_url, headers=self.auth_header)
        r.raise_for_status()
        return [self(token=token, **m) for m in r.json()]

    def save(self):
        r = requests.post(self.model_url, headers=self.auth_header, json={k: v for k, v in self.obj.items() if k in self.fields})
        r.raise_for_status()
        self.obj = r.json()
        return r.json()['url']

    def delete(self):
        assert self.url is not None, "Object must have a URL to delete."
        requests.delete(self.url, headers=self.auth_header)


class Tournament(BaseModel):
    fields = {'name', 'short_name', 'slug'}
    prefix = 'tournaments'


class Institution(BaseModel):
    fields = {'name', 'code', 'region'}
    prefix = 'institutions'


class VenueCategory(BaseModel):
    fields = {'venues', 'name', 'display_in_venue_name'}
    defaults = {'venues': []}
    prefix = '{tournament_slug}/venue-categories'


class Venue(BaseModel):
    fields = {'name', 'priority', 'categories'}
    defaults = {'categories': []}
    prefix = '{tournament_slug}/venues'


class AdjudicatorFeedbackQuestion(BaseModel):
    fields = {'seq', 'reference', 'name', 'text', 'answer_type', 'required', 'from_team', 'from_adj', 'min_value', 'max_value', 'choices'}
    defaults = {'choices': []}
    prefix = '{tournament_slug}/feedback-questions'

    def handle_choices(self, value):
        return value.split('//')

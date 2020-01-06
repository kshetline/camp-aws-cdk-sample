import axios from 'axios';

interface Location {
  displayName: string;
  zone: string;
}

interface SearchResult {
  matches: Location[];
}

interface ZoneForCity {
  city: string;
  zone: string;
}

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/ \(\w+\)$/g, '').replace(/\s?,\s/g, ',');
}

export async function getTimezone(event: any): Promise<any> {
  const city = (event.queryStringParameters?.city) ?? 'Chicago, IL';
  const normalized = normalize(city);

  try {
    const searchResult = await axios.get('https://skyviewcafe.com/atlas?q=' + encodeURIComponent(city));
    const locations = searchResult.data as SearchResult;
    let results: ZoneForCity[] = [];
    const fullMatches: ZoneForCity[] = [];
    const names = new Set<string>();

    locations.matches.forEach(match => {
      if (!names.has(match.displayName)) {
        names.add(match.displayName);
        results.push({ city: match.displayName, zone: match.zone });

        if (normalize(match.displayName) === normalized)
          fullMatches.push(results[results.length - 1]);
      }
    });

    if (fullMatches.length > 0)
      results = fullMatches;

    return { statusCode: 200, body: JSON.stringify(results) };
  }
  catch (err) {
    return { statusCode: 500, body: err.toString() };
  }
}

export const encodePathSegment = (value) =>
  encodeURIComponent(String(value));

export const buildApiUrl = (base, endpoint, ...segments) => {
  const encodedPath = segments.map(encodePathSegment).join('/');
  return `${base}${endpoint}/${encodedPath}${encodedPath ? '/' : ''}`;
};

export const fetchJson = async (request, fetchImpl = fetch) => {
  const response = await fetchImpl(request);
  if (!response.ok) {
    const requestUrl = typeof request === 'string' ? request : request.url;
    throw new Error(
      `Request to ${requestUrl} returned HTTP ${response.status}`
    );
  }
  return response.json();
};

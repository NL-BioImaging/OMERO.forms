const UI_SCHEMA_FILENAME = 'uischema.json';

const isJsonObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const containsUiSchemaDirective = (value) => {
  if (!isJsonObject(value)) {
    return false;
  }

  return Object.entries(value).some(([key, nestedValue]) =>
    key.startsWith('ui:') || containsUiSchemaDirective(nestedValue)
  );
};

const convertGitHubUrl = (url) => {
  const parsed = new URL(url);

  if (parsed.hostname !== 'github.com') {
    return parsed.toString();
  }

  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 5 || parts[2] !== 'blob') {
    return parsed.toString();
  }

  const [owner, repository, , revision, ...pathParts] = parts;
  const rawUrl = new URL(
    `https://raw.githubusercontent.com/${owner}/${repository}/${revision}/${pathParts.join('/')}`
  );
  rawUrl.search = parsed.search;
  return rawUrl.toString();
};

const adjacentUiSchemaUrl = (schemaUrl) =>
  new URL(UI_SCHEMA_FILENAME, convertGitHubUrl(schemaUrl)).toString();

const loadJsonObject = async (response, label) => {
  const value = await response.json();
  if (!isJsonObject(value)) {
    throw new Error(`${label} must contain a JSON object`);
  }
  return value;
};

const loadFormPackageFromUrl = async (url, fetchImpl = fetch) => {
  const schemaUrl = convertGitHubUrl(url);
  const schemaResponse = await fetchImpl(schemaUrl);
  if (!schemaResponse.ok) {
    throw new Error(`schema request returned HTTP ${schemaResponse.status}`);
  }

  const schema = await loadJsonObject(schemaResponse, 'Schema');
  const uiSchemaUrl = adjacentUiSchemaUrl(schemaUrl);
  let uiSchema = {};
  let uiSchemaWarning = null;

  try {
    const uiSchemaResponse = await fetchImpl(uiSchemaUrl);
    if (uiSchemaResponse.ok) {
      const loadedUiSchema = await loadJsonObject(
        uiSchemaResponse,
        'Adjacent UI schema'
      );
      if (
        Object.keys(loadedUiSchema).length > 0 &&
        !containsUiSchemaDirective(loadedUiSchema)
      ) {
        throw new Error(
          'Adjacent UI schema does not contain any RJSF ui:* directives'
        );
      }
      uiSchema = loadedUiSchema;
    } else if (uiSchemaResponse.status !== 404) {
      uiSchemaWarning =
        `Schema loaded, but adjacent ${UI_SCHEMA_FILENAME} returned HTTP ${uiSchemaResponse.status}`;
    }
  } catch (error) {
    uiSchemaWarning =
      `Schema loaded, but adjacent ${UI_SCHEMA_FILENAME} could not be loaded: ${error.message}`;
  }

  return {
    schema,
    schemaUrl,
    uiSchema,
    uiSchemaUrl,
    uiSchemaWarning,
  };
};

module.exports = {
  UI_SCHEMA_FILENAME,
  adjacentUiSchemaUrl,
  containsUiSchemaDirective,
  convertGitHubUrl,
  isJsonObject,
  loadFormPackageFromUrl,
};

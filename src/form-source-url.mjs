const SOURCE_URL_IN_MESSAGE = /from (https:\/\/[^\s]+)$/;

export const extractSourceUrlFromMessage = (message) => {
  if (typeof message !== 'string') {
    return '';
  }
  const match = message.match(SOURCE_URL_IN_MESSAGE);
  return match ? match[1] : '';
};

export const sourceUrlFromFormVersion = (form) => {
  if (typeof form.sourceUrl === 'string') {
    return form.sourceUrl;
  }
  return extractSourceUrlFromMessage(form.message);
};

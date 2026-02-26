import { sendApiRequest } from './pocketbaseGateway';

interface ParseMenuImageInput {
  uri: string;
  name: string;
  mimeType: string;
}

interface ParseMenuImageResponse {
  csv: string;
}

function buildParseMenuFormData(input: ParseMenuImageInput): FormData {
  const formData = new FormData();
  formData.append('image', {
    uri: input.uri,
    name: input.name,
    type: input.mimeType,
  } as unknown as Blob);
  return formData;
}

export async function parseMenuImage(input: ParseMenuImageInput): Promise<ParseMenuImageResponse> {
  const formData = buildParseMenuFormData(input);
  return sendApiRequest<ParseMenuImageResponse>('/api/parse-menu', {
    method: 'POST',
    body: formData,
  });
}

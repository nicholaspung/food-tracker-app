export type RecordModel = Record<string, unknown> & {
  collectionId?: string;
  collectionName?: string;
  id?: string;
};

export class ClientResponseError extends Error {
  status: number;
  response: Record<string, unknown>;
  isAbort: boolean;

  constructor(error?: {
    isAbort?: boolean;
    message?: string;
    response?: Record<string, unknown>;
    status?: number;
  }) {
    const responseMessage =
      typeof error?.response?.message === 'string' ? error.response.message : null;

    super(error?.message ?? responseMessage ?? 'Something went wrong.');
    this.name = `ClientResponseError ${error?.status ?? 0}`;
    this.status = error?.status ?? 0;
    this.response = error?.response ?? {};
    this.isAbort = error?.isAbort === true;
  }
}

export class BaseAuthStore {
  private onChangeCallbacks: ((token: string, record: RecordModel | null) => void)[] = [];
  token = '';
  record: RecordModel | null = null;

  get model(): RecordModel | null {
    return this.record;
  }

  get isValid(): boolean {
    return this.token.length > 0;
  }

  save(token: string, record?: RecordModel | null): void {
    this.token = token;
    this.record = record ?? null;
    this.triggerChange();
  }

  clear(): void {
    this.token = '';
    this.record = null;
    this.triggerChange();
  }

  onChange(callback: (token: string, record: RecordModel | null) => void): () => void {
    this.onChangeCallbacks.push(callback);
    return () => {
      this.onChangeCallbacks = this.onChangeCallbacks.filter((candidate) => candidate !== callback);
    };
  }

  protected triggerChange(): void {
    for (const callback of this.onChangeCallbacks) {
      callback(this.token, this.record);
    }
  }
}

class MockRecordService {
  async create(): Promise<RecordModel> {
    return {};
  }

  async delete(): Promise<boolean> {
    return true;
  }

  async getFirstListItem(): Promise<RecordModel> {
    return {};
  }

  async getFullList(): Promise<RecordModel[]> {
    return [];
  }

  async getList(): Promise<{ items: RecordModel[] }> {
    return { items: [] };
  }

  async getOne(): Promise<RecordModel> {
    return {};
  }

  async update(): Promise<RecordModel> {
    return {};
  }
}

export default class PocketBase {
  authStore: BaseAuthStore;
  files = {
    getURL: (record: RecordModel, filename: string) =>
      `${this.baseURL}/api/files/${record.collectionName ?? record.collectionId ?? 'records'}/${record.id ?? 'record'}/${filename}`,
  };

  constructor(
    public baseURL = '',
    authStore?: BaseAuthStore,
  ) {
    this.authStore = authStore ?? new BaseAuthStore();
  }

  buildURL(path = ''): string {
    return `${this.baseURL}${path}`;
  }

  autoCancellation(): this {
    return this;
  }

  collection(): MockRecordService {
    return new MockRecordService();
  }

  filter(filterExpression: string): string {
    return filterExpression;
  }

  async send(): Promise<unknown> {
    return {};
  }
}

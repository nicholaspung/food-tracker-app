import { createFeatureOutboxDomainRegistration } from './featureOutboxDomainRegistration';
import { createFeatureOutboxPayloadDecoder } from './featureOutboxPayloadDecoders';
import type { FeatureOutboxOperationPayloadMap } from './featureOutboxOperations';
import type { FeatureWriteRequestOptions } from './featureStoreShared';
import {
  convertVisitItemToFoodProduct,
  createVisit,
  deleteVisit,
  updateVisit,
} from './featureStore';

export const VISIT_WRITE_OUTBOX_REGISTRATION = createFeatureOutboxDomainRegistration({
  operationNames: [
    'visit.create',
    'visit.update',
    'visit.delete',
    'visit.item.convert-to-food-product',
  ] as const,
  payloadDecoders: {
    'visit.create': createFeatureOutboxPayloadDecoder('visit.create', [
      { key: 'restaurantName', type: 'string' },
      { key: 'items', type: 'array' },
    ]),
    'visit.update': createFeatureOutboxPayloadDecoder('visit.update', [
      { key: 'visitId', type: 'string' },
      { key: 'updates', type: 'record' },
    ]),
    'visit.delete': createFeatureOutboxPayloadDecoder('visit.delete', [
      { key: 'visitId', type: 'string' },
    ]),
    'visit.item.convert-to-food-product': createFeatureOutboxPayloadDecoder(
      'visit.item.convert-to-food-product',
      [{ key: 'itemId', type: 'string' }],
    ),
  },
  replayAdapters: {
    'visit.create': replayVisitCreate,
    'visit.update': replayVisitUpdate,
    'visit.delete': replayVisitDelete,
    'visit.item.convert-to-food-product': replayVisitItemConvertToFoodProduct,
  },
});

async function replayVisitCreate(
  payload: FeatureOutboxOperationPayloadMap['visit.create'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await createVisit(payload, requestOptions);
}

async function replayVisitUpdate(
  visitUpdatePayload: FeatureOutboxOperationPayloadMap['visit.update'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await updateVisit(visitUpdatePayload.visitId, visitUpdatePayload.updates, requestOptions);
}

async function replayVisitDelete(
  visitDeletePayload: FeatureOutboxOperationPayloadMap['visit.delete'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await deleteVisit(visitDeletePayload.visitId, requestOptions);
}

async function replayVisitItemConvertToFoodProduct(
  payload: FeatureOutboxOperationPayloadMap['visit.item.convert-to-food-product'],
  requestOptions: FeatureWriteRequestOptions,
): Promise<void> {
  await convertVisitItemToFoodProduct(payload, requestOptions);
}

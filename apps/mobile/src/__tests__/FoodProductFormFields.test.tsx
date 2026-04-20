import React from 'react';
import { act, create } from 'react-test-renderer';
import { useQuery } from '@tanstack/react-query';

import type { FoodProductCategorySuggestion } from '../features/store/foodProductsStore';
import type { FoodProductFormValues } from '../lib/foodProductForm';
import { FoodProductFormFields } from '../components/shared/FoodProductFormFields';

const mockReact = React;

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
}));

jest.mock('../features', () => ({
  listFoodProductCategorySuggestions: jest.fn(),
}));

jest.mock('../theme', () => ({
  createThemedStyles: () => () => ({}),
}));

jest.mock('../ui', () => ({
  Card: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Card', props, children),
  Input: (props: Record<string, unknown>) => mockReact.createElement('Input', props),
  Text: ({ children, ...props }: Record<string, unknown> & { children?: React.ReactNode }) =>
    mockReact.createElement('Text', props, children),
}));

jest.mock('../components/shared/FilterChipGroup', () => ({
  FilterChipGroup: (props: Record<string, unknown>) => mockReact.createElement('FilterChipGroup', props),
}));

jest.mock('../components/shared/PhotoDetectedDateField', () => ({
  PhotoDetectedDateField: (props: Record<string, unknown>) => mockReact.createElement('PhotoDetectedDateField', props),
}));

jest.mock('../components/shared/RatingLegend', () => ({
  RatingLegend: (props: Record<string, unknown>) => mockReact.createElement('RatingLegend', props),
}));

jest.mock('../components/shared/RatingSelector', () => ({
  RatingSelector: (props: Record<string, unknown>) => mockReact.createElement('RatingSelector', props),
}));

jest.mock('../components/shared/VisibilityOptionSelector', () => ({
  VisibilityOptionSelector: (props: Record<string, unknown>) =>
    mockReact.createElement('VisibilityOptionSelector', props),
}));

const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;

const CATEGORY_SUGGESTIONS: FoodProductCategorySuggestion[] = [
  {
    label: 'Produce',
    lastUsedAt: '2026-04-20T08:00:00.000Z',
    normalizedLabel: 'produce',
    useCount: 4,
  },
  {
    label: 'Packaged food',
    lastUsedAt: '2026-04-18T08:00:00.000Z',
    normalizedLabel: 'packaged food',
    useCount: 2,
  },
];

function buildDefaultValue(): FoodProductFormValues {
  return {
    itemName: '',
    locationText: '',
    category: '',
    rating: 3,
    notes: '',
    visibility: 'friends',
    date: '2026-04-20',
  };
}

function buildQueryResult() {
  return {
    data: CATEGORY_SUGGESTIONS,
    isError: false,
    isLoading: false,
  } as unknown as ReturnType<typeof useQuery>;
}

function TestHarness() {
  const [value, setValue] = React.useState<FoodProductFormValues>(() => buildDefaultValue());

  return (
    <FoodProductFormFields
      onChange={(updates) => {
        setValue((currentValue) => ({
          ...currentValue,
          ...updates,
        }));
      }}
      value={value}
    />
  );
}

function getInput(renderer: any, label: string) {
  return renderer.root.findAllByType('Input').find((node: any) => node.props.label === label);
}

function getLatestCategorySuggestionsEnabledValue() {
  const latestCall = mockedUseQuery.mock.calls.at(-1);
  return latestCall?.[0]?.enabled;
}

describe('FoodProductFormFields', () => {
  beforeEach(() => {
    mockedUseQuery.mockReset();
    mockedUseQuery.mockImplementation(() => buildQueryResult());
  });

  it('opens category suggestions on focus and keeps them expanded after category blur', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(<TestHarness />);
    });

    expect(renderer.root.findAllByType('FilterChipGroup')).toHaveLength(0);
    expect(getLatestCategorySuggestionsEnabledValue()).toBe(false);

    await act(async () => {
      getInput(renderer, 'Category (Optional)')?.props.onFocus();
    });

    expect(renderer.root.findAllByType('FilterChipGroup')).toHaveLength(1);
    expect(getLatestCategorySuggestionsEnabledValue()).toBe(true);

    await act(async () => {
      getInput(renderer, 'Category (Optional)')?.props.onBlur();
    });

    expect(renderer.root.findAllByType('FilterChipGroup')).toHaveLength(1);
    expect(getLatestCategorySuggestionsEnabledValue()).toBe(true);
  });

  it('selects a suggestion, updates the category value, and collapses the rail', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(<TestHarness />);
    });

    await act(async () => {
      getInput(renderer, 'Category (Optional)')?.props.onFocus();
    });

    await act(async () => {
      renderer.root.findByType('FilterChipGroup').props.onChange('Produce');
    });

    expect(getInput(renderer, 'Category (Optional)')?.props.value).toBe('Produce');
    expect(renderer.root.findAllByType('FilterChipGroup')).toHaveLength(0);
    expect(getLatestCategorySuggestionsEnabledValue()).toBe(false);
  });

  it('collapses category suggestions when another text input receives focus', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(<TestHarness />);
    });

    await act(async () => {
      getInput(renderer, 'Category (Optional)')?.props.onFocus();
    });

    expect(renderer.root.findAllByType('FilterChipGroup')).toHaveLength(1);

    await act(async () => {
      getInput(renderer, 'Food Product *')?.props.onFocus();
    });

    expect(renderer.root.findAllByType('FilterChipGroup')).toHaveLength(0);
    expect(getLatestCategorySuggestionsEnabledValue()).toBe(false);

    await act(async () => {
      getInput(renderer, 'Category (Optional)')?.props.onFocus();
    });

    await act(async () => {
      getInput(renderer, 'Notes (Optional)')?.props.onFocus();
    });

    expect(renderer.root.findAllByType('FilterChipGroup')).toHaveLength(0);
    expect(getLatestCategorySuggestionsEnabledValue()).toBe(false);
  });

  it('collapses category suggestions when rating or visibility changes', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(<TestHarness />);
    });

    await act(async () => {
      getInput(renderer, 'Category (Optional)')?.props.onFocus();
    });

    await act(async () => {
      renderer.root.findByType('RatingSelector').props.onChange(5);
    });

    expect(renderer.root.findAllByType('FilterChipGroup')).toHaveLength(0);
    expect(getLatestCategorySuggestionsEnabledValue()).toBe(false);

    await act(async () => {
      getInput(renderer, 'Category (Optional)')?.props.onFocus();
    });

    await act(async () => {
      renderer.root.findByType('VisibilityOptionSelector').props.onChange('private');
    });

    expect(renderer.root.findAllByType('FilterChipGroup')).toHaveLength(0);
    expect(getLatestCategorySuggestionsEnabledValue()).toBe(false);
  });

  it('collapses category suggestions when the item date changes', async () => {
    let renderer: any = null;

    await act(async () => {
      renderer = create(<TestHarness />);
    });

    await act(async () => {
      getInput(renderer, 'Category (Optional)')?.props.onFocus();
    });

    await act(async () => {
      renderer.root.findByType('PhotoDetectedDateField').props.onChange('2026-04-21');
    });

    expect(renderer.root.findAllByType('FilterChipGroup')).toHaveLength(0);
    expect(getLatestCategorySuggestionsEnabledValue()).toBe(false);
  });
});

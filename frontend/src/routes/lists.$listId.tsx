import { createFileRoute } from '@tanstack/react-router';
import ListDetailPage from '@/components/ListDetailPage';

export const Route = createFileRoute('/lists/$listId')({
  component: ListDetailPage,
});

import { createFileRoute } from '@tanstack/react-router';
import ListsPage from '@/components/ListsPage';

export const Route = createFileRoute('/lists')({
  component: ListsPage,
});

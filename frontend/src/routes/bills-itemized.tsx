import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { pb } from '@/lib/pocketbase';
import CreateItemizedBillPage from '@/components/bills/CreateItemizedBillPage';

export const Route = createFileRoute('/bills-itemized')({
  beforeLoad: () => {
    if (!pb.authStore.isValid) {
      throw redirect({ to: '/' });
    }
  },
  component: ItemizedBill,
});

function ItemizedBill() {
  const navigate = useNavigate();

  return (
    <CreateItemizedBillPage
      onCancel={() => navigate({ to: '/bills' })}
      onSuccess={(billId) => navigate({ to: '/bills' })}
    />
  );
}

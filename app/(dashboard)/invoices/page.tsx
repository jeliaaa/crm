import InvoiceForm from '@/components/InvoiceForm';

export default function InvoicesPage() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Create an invoice</h1>
      <p className="text-sm text-slate-500 mb-6">
        Issued by შპს თარგმნის სახლი (Translation House LLC). Download as PDF or Word, in Georgian, English or both.
      </p>
      <InvoiceForm />
    </div>
  );
}

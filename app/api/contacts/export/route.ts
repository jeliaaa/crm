import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { supabase } from '@/lib/supabase';
import { contactSearchGroups } from '@/lib/contactSearch';
import { stageLabel } from '@/lib/stages';
import { interestLabel } from '@/lib/interest';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CHUNK = 1000;

type Row = Record<string, any>;

// Page through a query: PostgREST caps a single response at 1000 rows.
async function fetchAll(
  build: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>
) {
  const out: Row[] = [];
  for (let from = 0; ; from += CHUNK) {
    const { data, error } = await build(from, from + CHUNK - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < CHUNK) break;
  }
  return out;
}

const lvl = (v: string | null) => (v === null ? 'not set' : interestLabel(v));
const stamp = (iso: string) => new Date(iso).toISOString().slice(0, 16).replace('T', ' ');

function changeText(a: Row): string {
  if (a.type === 'status_change')
    return `${a.from_stage ? stageLabel(a.from_stage) + ' → ' : ''}${stageLabel(a.to_stage)}`;
  if (a.type === 'interest_change') return `${lvl(a.from_stage)} → ${lvl(a.to_stage)}`;
  if (a.type === 'follow_up') return `Follow-up for ${a.follow_up_date}`;
  return '';
}

function describe(a: Row): string {
  const label =
    a.type === 'status_change' ? 'Status' : a.type === 'interest_change' ? 'Interest' : a.type === 'follow_up' ? 'Follow-up' : 'Comment';
  const change = changeText(a);
  return `[${stamp(a.created_at)}] ${label}${change ? ': ' + change : ''}${a.comment ? ' — ' + a.comment : ''}`;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const list = (k: string) => (sp.get(k) || '').split(',').map((v) => v.trim()).filter(Boolean);

  const stages = list('stage');
  const interests = list('interest'); // '0'..'5' and/or 'none'
  const city = sp.get('city');
  const category = sp.get('category');
  const contactInfo = sp.get('contact');
  const createdFrom = sp.get('createdFrom');
  const createdTo = sp.get('createdTo');
  const withHistory = sp.get('history') !== '0';
  const search = await contactSearchGroups(sp.get('q') || '');

  try {
    const contacts = await fetchAll((from, to) => {
      let q = supabase
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to);
      if (stages.length) q = q.in('stage', stages);
      if (city) q = q.ilike('city', `%${city}%`);
      if (category) q = q.ilike('category', `%${category}%`);
      for (const g of search) q = q.or(g);
      if (contactInfo === 'phone') q = q.not('phone', 'is', null).neq('phone', '');
      else if (contactInfo === 'email') q = q.not('email', 'is', null).neq('email', '');
      else if (contactInfo === 'phoneOrEmail')
        q = q.or('and(phone.not.is.null,phone.neq.),and(email.not.is.null,email.neq.)');
      if (createdFrom) q = q.gte('created_at', createdFrom);
      if (createdTo) q = q.lt('created_at', new Date(new Date(createdTo).getTime() + 86400000).toISOString());
      if (interests.length) {
        const nums = interests.filter((i) => /^[0-5]$/.test(i));
        const parts: string[] = [];
        if (nums.length) parts.push(`interest_level.in.(${nums.join(',')})`);
        if (interests.includes('none')) parts.push('interest_level.is.null');
        if (parts.length) q = q.or(parts.join(','));
      }
      return q;
    });

    // History per contact, oldest first.
    const history = new Map<string, Row[]>();
    if (withHistory && contacts.length) {
      const ids = contacts.map((c) => c.id as string);
      for (let i = 0; i < ids.length; i += 100) {
        const slice = ids.slice(i, i + 100);
        const acts = await fetchAll((from, to) =>
          supabase
            .from('contact_activities')
            .select('*')
            .in('contact_id', slice)
            .order('created_at', { ascending: true })
            .order('id')
            .range(from, to)
        );
        for (const a of acts) {
          if (!history.has(a.contact_id)) history.set(a.contact_id, []);
          history.get(a.contact_id)!.push(a);
        }
      }
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Contacts');
    const cols: { header: string; key: string; width: number }[] = [
      { header: 'Name', key: 'name', width: 34 },
      { header: 'ID №', key: 'identification_number', width: 16 },
      { header: 'Head', key: 'head', width: 22 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Mobile', key: 'mobile', width: 16 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Website', key: 'website', width: 26 },
      { header: 'Address', key: 'address', width: 34 },
      { header: 'City', key: 'city', width: 14 },
      { header: 'Region', key: 'region', width: 16 },
      { header: 'Industry', key: 'category', width: 22 },
      { header: 'Activity', key: 'activity', width: 26 },
      { header: 'Ownership', key: 'ownership_type', width: 18 },
      { header: 'Size', key: 'business_size', width: 12 },
      { header: 'Est.', key: 'established_year', width: 8 },
      { header: 'Stage', key: 'stage', width: 16 },
      { header: 'Interest level', key: 'interest', width: 40 },
      { header: 'Notes', key: 'notes', width: 36 },
      { header: 'Added', key: 'created_at', width: 12 },
    ];
    if (withHistory) cols.push({ header: 'History', key: 'history', width: 80 });
    ws.columns = cols;

    for (const c of contacts) {
      ws.addRow({
        ...c,
        activity: [c.activity_code, (c.categories || [])[0]].filter(Boolean).join(' '),
        stage: stageLabel(c.stage),
        interest: interestLabel(c.interest_level),
        created_at: c.created_at ? String(c.created_at).slice(0, 10) : '',
        history: (history.get(c.id) ?? []).map(describe).join('\n'),
      });
    }
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
    if (withHistory) ws.getColumn('history').alignment = { wrapText: true, vertical: 'top' };

    if (withHistory) {
      const hs = wb.addWorksheet('Contact history');
      hs.columns = [
        { header: 'Contact', key: 'contact', width: 34 },
        { header: 'ID №', key: 'idn', width: 16 },
        { header: 'Date', key: 'date', width: 18 },
        { header: 'Type', key: 'type', width: 16 },
        { header: 'Change', key: 'change', width: 60 },
        { header: 'Comment', key: 'comment', width: 60 },
      ];
      for (const c of contacts) {
        for (const a of history.get(c.id) ?? []) {
          hs.addRow({
            contact: c.name,
            idn: c.identification_number,
            date: stamp(a.created_at),
            type: String(a.type).replace('_', ' '),
            change: changeText(a),
            comment: a.comment ?? '',
          });
        }
      }
      hs.getRow(1).font = { bold: true };
      hs.views = [{ state: 'frozen', ySplit: 1 }];
      hs.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 6 } };
    }

    const buf = await wb.xlsx.writeBuffer();
    const date = new Date().toISOString().slice(0, 10);
    return new NextResponse(buf as ArrayBuffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="contacts-${date}.xlsx"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

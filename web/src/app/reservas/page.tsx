import { API_BASE, apiGet } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Item = {
  _id?: string; id?: string;
  fullName?: string;
  cpf?: string;
  people?: number;
  reservationDate?: string;
  birthdayDate?: string;
  utms?: Record<string, string>;
  createdAt?: string;
};

type Meta = { total:number; page:number; limit:number; pages:number; hasPrev:boolean; hasNext:boolean };

function fmt(v?: string|Date) {
  if (!v) return "-";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "-" : d.toLocaleString("pt-BR");
}

export default async function Page({
  searchParams
}: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {

  const sp = await searchParams;
  const page = Number(sp.page ?? "1");
  const limit = Number(sp.limit ?? "20");
  const q = (sp.q as string) || "";

  const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (q) qs.set("q", q);

  let data: { items: Item[]; meta: Meta };
  try {
    data = await apiGet(`/reservas?${qs.toString()}`);
  } catch (e:any) {
    return <div style={{padding:24,fontFamily:'system-ui, Arial'}}>
      <h1>Reservas</h1>
      <p style={{color:'#b00'}}>Erro ao consultar a API: {e.message}</p>
      <p>API_BASE: {API_BASE}</p>
    </div>;
  }

  const items = data.items ?? [];
  const meta = data.meta ?? { total:0, page:1, limit, pages:1, hasPrev:false, hasNext:false };

  const makeLink = (p:number) => `/reservas?page=${p}&limit=${meta.limit}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <div style={{padding:24,fontFamily:'system-ui, Arial', maxWidth:1100, margin:'0 auto'}}>
      <h1>Reservas</h1>

      <form method="GET" style={{ display:'flex', gap:8, margin:'12px 0' }}>
        <input name="q" placeholder="Buscar" defaultValue={q} style={{flex:1, padding:8}} />
        <input type="hidden" name="page" value="1" />
        <button>Buscar</button>
      </form>

      <div style={{overflowX:'auto', border:'1px solid #eee', borderRadius:8}}>
        <table style={{width:'100%', borderCollapse:'collapse'}}>
          <thead>
            <tr>
              <th style={{textAlign:'left',padding:8}}>Nome</th>
              <th style={{textAlign:'left',padding:8}}>CPF</th>
              <th style={{textAlign:'left',padding:8}}>Pessoas</th>
              <th style={{textAlign:'left',padding:8}}>Data</th>
              <th style={{textAlign:'left',padding:8}}>Criado</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={5} style={{padding:12,color:'#777',textAlign:'center'}}>Sem registros</td></tr>}
            {items.map((it) => (
              <tr key={String(it._id || it.id)} style={{borderTop:'1px solid #f0f0f0'}}>
                <td style={{padding:8}}>{it.fullName || '-'}</td>
                <td style={{padding:8}}>{it.cpf || '-'}</td>
                <td style={{padding:8}}>{it.people ?? '-'}</td>
                <td style={{padding:8}}>{fmt(it.reservationDate)}</td>
                <td style={{padding:8}}>{fmt(it.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display:'flex', gap:8, marginTop:12 }}>
        <a href={makeLink(Math.max(1, meta.page-1))} style={{opacity: meta.hasPrev?1:.5, pointerEvents: meta.hasPrev?'auto':'none'}}>◀ Anterior</a>
        <a href={makeLink(Math.min(meta.pages, meta.page+1))} style={{opacity: meta.hasNext?1:.5, pointerEvents: meta.hasNext?'auto':'none'}}>Próxima ▶</a>
      </div>
    </div>
  );
}

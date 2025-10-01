export default function Page() {
  return (
    <div style={{padding:24,fontFamily:'system-ui, Arial'}}>
      <h1>MANE • Demo</h1>
      <ul>
        <li><a href="/reservas">Listar reservas</a></li>
        <li><a href="/reservar">Nova reserva (wizard)</a></li>
      </ul>
    </div>
  );
}

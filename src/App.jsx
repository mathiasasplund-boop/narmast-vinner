
import React, { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const CITIES = [
  ['Stockholm','Sverige',59.3293,18.0686],
  ['Paris','Frankrike',48.8566,2.3522],
  ['London','Storbritannien',51.5072,-0.1276],
  ['Tokyo','Japan',35.6762,139.6503],
  ['New York','USA',40.7128,-74.006],
  ['Sydney','Australien',-33.8688,151.2093],
  ['Rio de Janeiro','Brasilien',-22.9068,-43.1729],
  ['Kapstaden','Sydafrika',-33.9249,18.4241],
  ['Kairo','Egypten',30.0444,31.2357],
  ['Istanbul','Turkiet',41.0082,28.9784],
  ['Bangkok','Thailand',13.7563,100.5018],
  ['Reykjavik','Island',64.1466,-21.9426],
  ['Rom','Italien',41.9028,12.4964],
  ['Mexico City','Mexiko',19.4326,-99.1332],
  ['Buenos Aires','Argentina',-34.6037,-58.3816],
  ['Dubai','Förenade Arabemiraten',25.2048,55.2708],
  ['Singapore','Singapore',1.3521,103.8198],
  ['Seoul','Sydkorea',37.5665,126.978],
  ['Helsingfors','Finland',60.1699,24.9384],
  ['Marrakech','Marocko',31.6295,-7.9811],
  ['Toronto','Kanada',43.6532,-79.3832],
  ['Lima','Peru',-12.0464,-77.0428],
  ['Aten','Grekland',37.9838,23.7275],
  ['Prag','Tjeckien',50.0755,14.4378],
  ['Delhi','Indien',28.6139,77.209],
  ['Hanoi','Vietnam',21.0278,105.8342],
  ['Auckland','Nya Zeeland',-36.8509,174.7645],
  ['Oslo','Norge',59.9139,10.7522],
  ['Lissabon','Portugal',38.7223,-9.1393],
  ['Amsterdam','Nederländerna',52.3676,4.9041]
];

function distance(a,b,c,d) {
  const rad = x => x * Math.PI / 180;
  const x = rad(c-a), y = rad(d-b);
  const h = Math.sin(x/2)**2 +
    Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(y/2)**2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}


function MapView({ onPick, guesses=[], target=null, selected=null }) {
  const mapRef = useRef(null);
  const instance = useRef(null);
  const markers = useRef([]);
  const onPickRef = useRef(onPick);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    if (!mapRef.current || instance.current) return;

    const map = L.map(mapRef.current).setView([25,10],2);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      attribution:'© OpenStreetMap contributors',
      maxZoom:18
    }).addTo(map);

    map.on('click', e => {
      onPickRef.current?.(e.latlng.lat,e.latlng.lng);
    });

    instance.current = map;

    setTimeout(() => map.invalidateSize(),200);

    return () => {
      map.remove();
      instance.current = null;
    };
  }, []);

  useEffect(() => {
    const map = instance.current;
    if (!map) return;

    markers.current.forEach(m => m.remove());
    markers.current = [];

    if (selected) {
      markers.current.push(
        L.marker([selected.lat,selected.lng])
          .addTo(map)
          .bindPopup('Din gissning')
          .openPopup()
      );
    }

    guesses.forEach(g => {
      markers.current.push(
        L.circleMarker([g.latitude,g.longitude],{
          radius:9,
          color:'#f59e0b',
          fillColor:'#fbbf24',
          fillOpacity:1
        }).addTo(map).bindPopup(g.name || 'Lagets gissning')
      );
    });

    if (target) {
      markers.current.push(
        L.marker([target.lat,target.lng])
          .addTo(map)
          .bindPopup('Rätt svar')
      );
    }
  },[guesses,target,selected]);

  return (
    <div
      ref={mapRef}
      style={{
        height:'min(65vh,560px)',
        width:'100%',
        borderRadius:14,
        zIndex:1
      }}
    />
  );
}

export default function App() {
  const [session,setSession] = useState(null);
  const [loading,setLoading] = useState(true);
  const [mode,setMode] = useState('home');
  const [game,setGame] = useState(null);
  const [teams,setTeams] = useState([]);
  const [rounds,setRounds] = useState([]);
  const [guesses,setGuesses] = useState([]);
  const [team,setTeam] = useState(null);
  const [guess,setGuess] = useState(null);
  const [teamName,setTeamName] = useState('');
  const [teamNames,setTeamNames] = useState('Lag 1\nLag 2\nLag 3');
  const [selectedCities,setSelectedCities] = useState([]);
  const [error,setError] = useState('');
  const [message,setMessage] = useState('');
  const [saving,setSaving] = useState(false);

  const currentRound = rounds.find(r =>
    r.round_number === game?.current_round
  );

  useEffect(() => {
    supabase.auth.getSession().then(({data}) => {
      setSession(data.session);
      setLoading(false);
    });
    const {data:{subscription}} = supabase.auth.onAuthStateChange(
      (_event,s) => setSession(s)
    );
    return () => subscription.unsubscribe();
  },[]);

  useEffect(() => {
    const code = new URLSearchParams(location.search).get('team');
    if (code) setMode('join');
  },[]);

  async function signIn() {
    setError('');
    const {data,error} = await supabase.auth.signInAnonymously();
    if (error) setError(error.message);
    return data?.session;
  }

  async function createGame() {
    setSaving(true); setError('');
    try {
      let s=session;
      if (!s) s=await signIn();
      if (!s) throw new Error('Kunde inte logga in.');
      const {data:g,error:e} = await supabase.from('games')
        .insert({status:'waiting'}).select().single();
      if (e) throw e;

      const names=teamNames.split('\n').map(x=>x.trim()).filter(Boolean);
      if (!names.length) throw new Error('Lägg till minst ett lag.');
      const teamRows=names.map(name=>({
        game_id:g.id,name,
        join_code:crypto.randomUUID().replaceAll('-','').slice(0,10)
      }));
      const {data:t,error:te}=await supabase.from('teams')
        .insert(teamRows).select();
      if (te) throw te;

      const cityRows=selectedCities.map((index,i)=>{
        const c=CITIES[index];
        return {
          game_id:g.id,round_number:i+1,
          target_city:c[0],target_country:c[1],
          target_lat:c[2],target_lng:c[3]
        };
      });
      const {data:r,error:re}=await supabase.from('rounds')
        .insert(cityRows).select();
      if (re) throw re;

      setGame(g);setTeams(t);setRounds(r);
      setMode('host');
      await refreshHost(g.id);
    } catch(e) {setError(e.message || 'Något gick fel.');}
    setSaving(false);
  }

  async function refreshHost(gameId=game?.id) {
    if (!gameId) return;
    const [{data:g},{data:t},{data:r},{data:gs}] = await Promise.all([
      supabase.from('games').select('*').eq('id',gameId).single(),
      supabase.from('teams').select('*').eq('game_id',gameId),
      supabase.from('rounds').select('*').eq('game_id',gameId).order('round_number'),
      supabase.from('guesses').select('*, teams(name)').in(
        'team_id',
        (teams.length ? teams : []).map(x=>x.id)
      )
    ]);
    if (g) setGame(g);
    if (t) setTeams(t);
    if (r) setRounds(r);
    if (gs) setGuesses(gs);
  }

  useEffect(() => {
    if (mode!=='host' || !game?.id) return;
    const channel=supabase.channel('host-'+game.id)
      .on('postgres_changes',{event:'*',schema:'public',table:'guesses'},
        () => refreshHost())
      .on('postgres_changes',{event:'*',schema:'public',table:'games',
        filter:'id=eq.'+game.id},() => refreshHost())
      .subscribe();
    return () => {supabase.removeChannel(channel);};
  },[mode,game?.id,teams.length]);

  async function joinTeam() {
    setError('');setSaving(true);
    try {
      let s=session;
      if (!s) s=await signIn();
      if (!s) throw new Error('Kunde inte ansluta.');
      const code=new URLSearchParams(location.search).get('team');
      const {data:id,error:e}=await supabase.rpc('join_team',{
        p_join_code:code
      });
      if (e) throw e;
      if (!id) throw new Error('Länken är ogiltig eller laget är redan anslutet.');
      const {data:t,error:te}=await supabase.from('teams')
        .select('*').eq('id',id).single();
      if (te) throw te;
      const {data:g,error:ge}=await supabase.from('games')
        .select('*').eq('id',t.game_id).single();
      if (ge) throw ge;
      setTeam(t);setGame(g);setMode('team');
      await refreshTeam(t,g);
    } catch(e) {setError(e.message || 'Kunde inte ansluta.');}
    setSaving(false);
  }

  
async function refreshTeam(t=team,g=game) {
  if (!t || !g) return;

  const {data: gameData,error: gameError} = await supabase
    .from('games')
    .select('*')
    .eq('id',g.id)
    .single();

  if (gameError) {
    setError(gameError.message);
    return;
  }

  if (gameData) setGame(gameData);

  const {data: currentRows,error: roundError} = await supabase
    .rpc('get_team_current_round',{p_team_id:t.id});

  if (roundError) {
    setError(roundError.message);
    return;
  }

  const current = currentRows?.[0];

  if (!current) {
    setRounds([]);
    return;
  }

  const round = {
    id:current.round_id,
    round_number:current.round_number,
    target_city:current.target_city,
    target_country:current.target_country,
    target_lat:current.target_lat,
    target_lng:current.target_lng
  };

  setRounds([round]);

  const {data: gs,error: guessError} = await supabase
    .from('guesses')
    .select('*')
    .eq('team_id',t.id)
    .eq('round_id',current.round_id);

  if (guessError) {
    setError(guessError.message);
    return;
  }

  if (gs?.length) {
    setGuess({
      lat:gs[0].latitude,
      lng:gs[0].longitude
    });
  } else {
    setGuess(null);
  }
}

  useEffect(() => {
    if (mode!=='team' || !game?.id) return;
    const channel=supabase.channel('team-'+game.id)
      .on('postgres_changes',{event:'*',schema:'public',table:'games',
        filter:'id=eq.'+game.id},() => refreshTeam())
      .on('postgres_changes',{event:'*',schema:'public',table:'rounds',
        filter:'game_id=eq.'+game.id},() => refreshTeam())
      .subscribe();
    return () => {supabase.removeChannel(channel);};
  },[mode,game?.id,team?.id]);

  async function saveGuess(lat,lng) {
    setGuess({lat,lng});
    if (!team || !currentRound) return;
    const {error:e}=await supabase.from('guesses').upsert({
      team_id:team.id,round_id:currentRound.id,
      latitude:lat,longitude:lng
    },{onConflict:'team_id,round_id'});
    if (e) setError(e.message);
    else setMessage('Din gissning är sparad!');
  }

  async function updateGame(values) {
    const {error:e}=await supabase.from('games')
      .update(values).eq('id',game.id);
    if (e) setError(e.message);
    else await refreshHost();
  }

  async function nextRound() {
    if (game.current_round < rounds.length) {
      await updateGame({
        current_round:game.current_round+1,
        reveal_guesses:false,reveal_answer:false
      });
    } else {
      await updateGame({status:'finished'});
    }
  }

  const card={background:'#fff',color:'#172033',padding:22,
    borderRadius:16,boxShadow:'0 5px 25px #0001',marginBottom:16};
  const button={background:'#174e83',color:'white',border:0,
    padding:'12px 18px',borderRadius:9,fontWeight:700,cursor:'pointer'};
  const input={padding:12,border:'1px solid #ccd3dd',
    borderRadius:8,width:'100%',boxSizing:'border-box',fontSize:16};

  if (loading) return <main style={{padding:30}}>Laddar spelet…</main>;

  if (mode==='home') return <main style={{maxWidth:850,margin:'40px auto',
    padding:20,fontFamily:'Arial',color:'#172033'}}>
    <h1 style={{fontSize:42}}>Närmast vinner</h1>
    <p>Det geografiska tävlingsspelet – inspirerat av På Spåret.</p>
    <section style={card}>
      <h2>Skapa en spelomgång</h2>
      <label>Lag – ett lagnamn per rad</label>
      <textarea value={teamNames} onChange={e=>setTeamNames(e.target.value)}
        style={{...input,minHeight:100,marginTop:8}}/>
      <h3>Välj resmål</h3>
      <p>Välj städer i den ordning de ska komma i spelet.</p>
      <div style={{display:'grid',gridTemplateColumns:
        'repeat(auto-fit,minmax(190px,1fr))',gap:8}}>
        {CITIES.map((c,i)=><label key={i} style={{
          padding:9,border:'1px solid #ddd',borderRadius:8,
          background:selectedCities.includes(i)?'#e3f1ff':'white'}}>
          <input type="checkbox" checked={selectedCities.includes(i)}
            onChange={e=>setSelectedCities(old=>e.target.checked
              ? [...old,i] : old.filter(x=>x!==i))}/>
          {' '}{c[0]}, {c[1]}
        </label>)}
      </div>
      <p>{selectedCities.length} resmål valda.</p>
      <button style={button} disabled={saving || !selectedCities.length}
        onClick={createGame}>
        {saving?'Skapar…':'Skapa spel'}
      </button>
    </section>
    <section style={card}>
      <h2>Är du ett lag?</h2>
      <p>Öppna lagets personliga QR-länk för att ansluta.</p>
    </section>
    {error && <p style={{color:'crimson'}}>{error}</p>}
  </main>;

  if (mode==='join') return <main style={{maxWidth:500,margin:'70px auto',
    padding:20,fontFamily:'Arial'}}>
    <section style={card}>
      <h1>Anslut till spelet</h1>
      <p>Du ansluter till laget via den personliga länken.</p>
      <button style={button} disabled={saving} onClick={joinTeam}>
        {saving?'Ansluter…':'Anslut som lag'}
      </button>
      {error && <p style={{color:'crimson'}}>{error}</p>}
    </section>
  </main>;

  if (mode==='host') return <main style={{fontFamily:'Arial',
    background:'#eef2f7',minHeight:'100vh',padding:20,color:'#172033'}}>
    <div style={{maxWidth:1100,margin:'auto'}}>
      <h1>Närmast vinner – spelledare</h1>
      <section style={card}>
        <h2>Spelkontroll</h2>
        <p>Runda {game?.current_round} av {rounds.length}</p>
        <p>Status: {game?.status}</p>
        <button style={button} onClick={()=>updateGame({
          reveal_guesses:true
        })}>Visa lagens gissningar</button>{' '}
        <button style={button} onClick={()=>updateGame({
          reveal_answer:true
        })}>Avslöja facit</button>{' '}
        <button style={button} onClick={nextRound}>Nästa runda</button>
      </section>
      <section style={card}>
        <h2>Lag och QR-länkar</h2>
        {teams.map(t=><div key={t.id} style={{
          padding:12,borderBottom:'1px solid #ddd'}}>
          <strong>{t.name}</strong>
          <p style={{overflowWrap:'anywhere'}}>
            {location.origin+location.pathname+'?team='+t.join_code}
          </p>
          <button style={button} onClick={()=>
            navigator.clipboard.writeText(
              location.origin+location.pathname+'?team='+t.join_code
            )}>Kopiera laglänk</button>
        </div>)}
      </section>
      <section style={card}>
        <h2>Karta – lagens svar</h2>
        {game?.reveal_guesses
          ? <MapView guesses={guesses.map(g=>({
              ...g,name:g.teams?.name
            }))} target={game?.reveal_answer && currentRound ? {
              lat:currentRound.target_lat,lng:currentRound.target_lng
            }:null}/>
          : <p>Gissningarna är dolda. Visa dem när alla lag är klara.</p>}
      </section>
      {game?.reveal_answer && currentRound && <section style={card}>
        <h2>Rätt svar: {currentRound.target_city}, {currentRound.target_country}</h2>
        {guesses.filter(g=>g.round_id===currentRound.id).map(g=>
          <p key={g.id}>{g.teams?.name}: {distance(
            g.latitude,g.longitude,
            currentRound.target_lat,currentRound.target_lng
          ).toFixed(0)} km från målet</p>)}
      </section>}
      {error && <p style={{color:'crimson'}}>{error}</p>}
    </div>
  </main>;

  if (mode==='team') return <main style={{fontFamily:'Arial',
    background:'#eef2f7',minHeight:'100vh',padding:16,color:'#172033'}}>
    <div style={{maxWidth:850,margin:'auto'}}>
      <section style={card}>
        <h1>{team?.name}</h1>
        <h2>Runda {game?.current_round}</h2>
        {game?.status==='finished'
          ? <h2>Spelet är slut!</h2>
          : game?.reveal_answer
            ? <h2>Facit: {currentRound?.target_city}, {currentRound?.target_country}</h2>
            : game?.reveal_guesses
              ? <h2>Spelledaren visar lagens gissningar!</h2>
              : <h2>Var ligger staden?</h2>}
        <p>Klicka på kartan för att placera din gissning.</p>
        {currentRound && !game?.reveal_answer &&
          <MapView onPick={saveGuess} selected={guess
            ? {lat:guess.lat,lng:guess.lng}:null}/>}
        {guess && <p>Din markering: {guess.lat.toFixed(3)}, {guess.lng.toFixed(3)}</p>}
        {message && <p>{message}</p>}
        {error && <p style={{color:'crimson'}}>{error}</p>}
      </section>
    </div>
  </main>;

  return null;
}

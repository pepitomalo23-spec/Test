/* Arranque: escucha la sesión de Supabase y entra en la app. Va el último
   para que todo lo demás ya esté cargado cuando se ejecute. */

// Evita que los refrescos de token en segundo plano (silenciosos y
// automáticos) reinicien la app: solo deben disparar el flujo completo
// de login (comprobación de dispositivo, recarga de datos, ir a inicio)
// los eventos que representan un inicio de sesión real.
let authInitialized = false;
let loginScheduledFor = null; // usuario cuyo onLoggedIn ya está programado
sb.auth.onAuthStateChange((event, session) => {
  if(event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED'){
    // El token se ha renovado en segundo plano: solo actualizamos el
    // usuario en memoria, sin tocar la pantalla ni recargar nada.
    if(session && session.user) currentUser = session.user;
    return;
  }

  if(event === 'INITIAL_SESSION'){
    if(authInitialized) return; // ya se procesó (evita doble carga inicial)
    authInitialized = true;
  }

  if(session && session.user){
    // Si ya estábamos logueados con este mismo usuario, no repetir todo
    // el flujo (comprobación de dispositivo incluida) sin necesidad.
    const alreadyIn = (currentUser && currentUser.id === session.user.id) || loginScheduledFor === session.user.id;
    if(alreadyIn && event !== 'SIGNED_IN'){ return; }
    // IMPORTANTE: el flujo de entrada hace muchas consultas a Supabase y
    // NO puede empezar dentro de este callback. Supabase lo ejecuta con su
    // bloqueo interno de sesión cogido, y cualquier consulta lanzada aquí
    // se queda esperando a ese mismo bloqueo: la app se quedaba a veces
    // en «Cargando…» para siempre (sobre todo al volver tras un rato, cuando
    // toca renovar la sesión) y solo se arreglaba cerrando la pestaña.
    // Con setTimeout se ejecuta justo después, ya fuera del bloqueo.
    const user = session.user, fresh = consumeFreshLoginIntent();
    loginScheduledFor = user.id;
    setTimeout(() => { loginScheduledFor = null; onLoggedIn(user, fresh); }, 0);
  } else {
    loginScheduledFor = null;
    setTimeout(onLoggedOut, 0);
  }
});

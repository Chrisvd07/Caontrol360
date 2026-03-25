'use client';

/**
 * EJEMPLO: Cómo usar Firebase Firestore para crear y gestionar solicitudes
 * Este archivo muestra las prácticas recomendadas
 */

import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useUserRequests } from '@/hooks/use-firestore';
import { generateRequestNumber } from '@/lib/storage'; // Puedes migrar esto a Firestore también
import type { Request, RequestType } from '@/lib/types';

export function CrearSolicitudEjemplo() {
  const { user } = useAuth();
  const { createRequest, loading, error } = useUserRequests(user?.id);
  const [tipo, setTipo] = useState<RequestType>('combustible');
  const [monto, setMonto] = useState(0);

  const handleCrearSolicitud = async () => {
    if (!user) return;

    try {
      const newRequest = await createRequest({
        userId: user.id,
        userName: user.name,
        numero: generateRequestNumber(), // O generar desde Firebase Cloud Function
        type: tipo,
        totalAmount: monto,
        status: 'enviada',
        items: [
          {
            id: `item-${Date.now()}`,
            type: tipo,
            description: `${tipo.charAt(0).toUpperCase() + tipo.slice(1)} del ${new Date().toLocaleDateString('es-DO')}`,
            amount: monto,
          }
        ],
        evidences: [],
        approvedAmount: monto,
      });

      console.log('✅ Solicitud creada:', newRequest);
      alert(`Solicitud ${newRequest.numero} creada exitosamente!`);
      
      // Limpiar formulario
      setMonto(0);
    } catch (err) {
      console.error('❌ Error al crear solicitud:', err);
      alert(`Error: ${error || 'No se pudo crear la solicitud'}`);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '500px' }}>
      <h2>Crear Nueva Solicitud</h2>

      <div style={{ marginBottom: '1rem' }}>
        <label>Tipo de Solicitud</label>
        <select 
          value={tipo} 
          onChange={(e) => setTipo(e.target.value as RequestType)}
        >
          <option value="combustible">Combustible</option>
          <option value="materiales">Materiales</option>
          <option value="viatico">Viatico</option>
          <option value="gomera">Gomera</option>
          <option value="otros">Otros</option>
        </select>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label>Monto (RD$)</label>
        <input
          type="number"
          value={monto}
          onChange={(e) => setMonto(Number(e.target.value))}
          placeholder="0.00"
        />
      </div>

      <button 
        onClick={handleCrearSolicitud}
        disabled={loading || !user}
        style={{
          padding: '0.5rem 1rem',
          backgroundColor: loading ? '#ccc' : '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer'
        }}
      >
        {loading ? 'Creando...' : 'Crear Solicitud'}
      </button>

      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
    </div>
  );
}

/**
 * EJEMPLO 2: Listar solicitudes con actualización en tiempo real
 */
export function ListarSolicitudes() {
  const { user } = useAuth();
  const { requests, loading, refresh } = useUserRequests(user?.id);

  if (!user) return <div>Usuario no autenticado</div>;
  if (loading) return <div>Cargando solicitudes...</div>;

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <h2>Mis Solicitudes</h2>
        <button onClick={refresh}>🔄 Refrescar</button>
      </div>

      {requests.length === 0 ? (
        <p>No tienes solicitudes aún</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f0f0f0' }}>
              <th style={{ border: '1px solid #ddd', padding: '8px' }}>Número</th>
              <th style={{ border: '1px solid #ddd', padding: '8px' }}>Tipo</th>
              <th style={{ border: '1px solid #ddd', padding: '8px' }}>Monto</th>
              <th style={{ border: '1px solid #ddd', padding: '8px' }}>Estado</th>
              <th style={{ border: '1px solid #ddd', padding: '8px' }}>Fecha</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((req) => (
              <tr key={req.id}>
                <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                  {req.numero}
                </td>
                <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                  {req.type}
                </td>
                <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                  RD$ {req.totalAmount.toLocaleString('es-DO')}
                </td>
                <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    backgroundColor: req.status === 'aprobada' ? '#d4edda' : '#fff3cd',
                    color: req.status === 'aprobada' ? '#155724' : '#856404'
                  }}>
                    {req.status}
                  </span>
                </td>
                <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                  {new Date(req.createdAt).toLocaleDateString('es-DO')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/**
 * EJEMPLO 3: Aprobar/Rechazar solicitudes (para roles admin/pagos)
 */
export function GestionarSolicitud({ requestId }: { requestId: string }) {
  const { user } = useAuth();
  const { updateRequest, loading } = useUserRequests(user?.id);

  const handleApprove = async (id: string) => {
    if (!user) return;

    try {
      await updateRequest(
        id,
        { 
          status: 'aprobada',
          approvedBy: user.id,
          approvedAt: new Date().toISOString(),
        },
        user.id,
        user.name
      );
      alert('✅ Solicitud aprobada');
    } catch (err) {
      alert('❌ Error al aprobar solicitud');
    }
  };

  const handleReject = async (id: string) => {
    if (!user) return;
    const reason = prompt('¿Por qué rechazas esta solicitud?');
    if (!reason) return;

    try {
      await updateRequest(
        id,
        { 
          status: 'rechazada',
          observations: [reason],
        },
        user.id,
        user.name
      );
      alert('✅ Solicitud rechazada');
    } catch (err) {
      alert('❌ Error al rechazar solicitud');
    }
  };

  return (
    <div>
      <button 
        onClick={() => handleApprove(requestId)}
        disabled={loading}
        style={{ marginRight: '8px', backgroundColor: '#28a745', color: 'white', padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
      >
        ✓ Aprobar
      </button>
      <button 
        onClick={() => handleReject(requestId)}
        disabled={loading}
        style={{ backgroundColor: '#dc3545', color: 'white', padding: '8px 16px', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
      >
        ✗ Rechazar
      </button>
    </div>
  );
}

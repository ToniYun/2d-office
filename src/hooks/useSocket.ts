import { useEffect, useRef } from 'react';
import { connectSocket, disconnectSocket } from '../network/socket';
import { useGameStore } from '../store/gameStore';
import type { PlayerData } from '../types';
import type { Socket } from 'socket.io-client';

export const useSocket = () => {
  const { setLocalPlayerId, addPlayer, removePlayer, updatePlayer, setPlayers } =
    useGameStore();

  const socketRef = useRef<Socket>(connectSocket());

  useEffect(() => {
    const socket = socketRef.current;

    // Handle case where socket connected before effect ran
    if (socket.connected && socket.id) {
      setLocalPlayerId(socket.id);
    }

    const onConnect = () => {
      if (socket.id) setLocalPlayerId(socket.id);
    };

    const onCurrentPlayers = (players: PlayerData[]) => {
      setPlayers(players);
    };

    const onPlayerJoined = (player: PlayerData) => {
      addPlayer(player);
    };

    const onPlayerLeft = (id: string) => {
      removePlayer(id);
    };

    const onPlayerMoved = (data: {
      id: string;
      position: [number, number, number];
      rotation: [number, number];
    }) => {
      updatePlayer(data.id, { position: data.position, rotation: data.rotation });
    };

    const onAgentActive = ({ agentId }: { agentId: string }) => {
      useGameStore.getState().pushAgentJob(agentId);
    };
    const onAgentIdle = ({ agentId }: { agentId: string }) => {
      useGameStore.getState().pushAgentIdle(agentId);
    };
    const onAgentHandoff = ({ from, to }: { from: string; to: string }) => {
      useGameStore.getState().pushHandoff({ from, to, at: Date.now() });
    };

    socket.on('connect', onConnect);
    socket.on('currentPlayers', onCurrentPlayers);
    socket.on('playerJoined', onPlayerJoined);
    socket.on('playerLeft', onPlayerLeft);
    socket.on('playerMoved', onPlayerMoved);
    socket.on('agentActive', onAgentActive);
    socket.on('agentIdle', onAgentIdle);
    socket.on('agentHandoff', onAgentHandoff);

    return () => {
      socket.off('connect', onConnect);
      socket.off('currentPlayers', onCurrentPlayers);
      socket.off('playerJoined', onPlayerJoined);
      socket.off('playerLeft', onPlayerLeft);
      socket.off('playerMoved', onPlayerMoved);
      socket.off('agentActive', onAgentActive);
      socket.off('agentIdle', onAgentIdle);
      socket.off('agentHandoff', onAgentHandoff);
      disconnectSocket();
    };
  }, []);

  const joinGame = (name: string, color: string) => {
    socketRef.current.emit('join', { name, color });
  };

  const sendMove = (
    position: [number, number, number],
    rotation: [number, number]
  ) => {
    socketRef.current.emit('move', { position, rotation });
  };

  return { socket: socketRef.current, joinGame, sendMove };
};

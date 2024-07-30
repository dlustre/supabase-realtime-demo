import { RealtimeChannel } from '@supabase/supabase-js';
import { Audio } from 'expo-av';
import React, { useEffect, useState } from 'react';
import { Button, Paragraph, Separator, XGroup, YGroup } from 'tamagui';
import { Circle, X } from '@tamagui/lucide-icons';
import { Container } from '~/components/Container';
import { ScreenContent } from '~/components/ScreenContent';
import { supabase } from '~/utils/supabase';
import { useGlobalStore } from '~/utils/zustand';

/** A message sent over the channel. */
enum ChannelMessage {
  start = 'start',
  move = 'move',
}

/** The markers on the board. */
const markers = {
  empty: null,
  o: <Circle />,
  x: <X />,
} as const;

type Marker = keyof typeof markers;

/** A move that can be made on the board. */
enum Move {
  topLeft,
  topMid,
  topRight,
  midLeft,
  midMid,
  midRight,
  bottomLeft,
  bottomMid,
  bottomRight,
}

/** Game state shared over the channel. */
interface GameState {
  usingO: string;
  usingX: string;
  whoseTurn: string;
  board: Marker[];
  winner: string | null;
}

const winningCombinations = [
  // Rows
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  // Columns
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  // Diagonals
  [0, 4, 8],
  [2, 4, 6],
] as const;

export default function Index() {
  const { userId } = useGlobalStore();
  const [gameState, setGameState] = useState<GameState>();
  const [channel, setChannel] = useState<RealtimeChannel>();

  async function playSound() {
    console.log('Loading Sound');
    const { sound } = await Audio.Sound.createAsync(require('../assets/gold.mp3'));
    console.log('Playing Sound');
    await sound.playAsync();
  }

  /** Update the game state and send the new state to the channel. */
  async function handleMove(channel: RealtimeChannel, move: Move) {
    if (!gameState) return;
    const opponentId = gameState.usingO === userId ? gameState.usingX : gameState.usingO;
    const marker = gameState.usingO === userId ? 'o' : 'x';
    const newState = {
      ...gameState,
      board: gameState.board.map((prevMarker, i) => (i === move ? marker : prevMarker)),
      whoseTurn: gameState.whoseTurn === userId ? opponentId : userId,
    };
    newState.winner = checkGameOver(newState);
    await channel.send({
      type: 'broadcast',
      event: ChannelMessage.move,
      payload: newState,
    });
    setGameState(newState);
  }

  /** Returns a string indicating the winner. Returns null if game in progress. */
  function checkGameOver({ board, usingX, usingO }: GameState): 'tie' | string | null {
    for (const [first, second, third] of winningCombinations) {
      const line = [board[first], board[second], board[third]];
      if (line.every((marker) => marker === 'x')) return usingX;
      else if (line.every((marker) => marker === 'o')) return usingO;
    }
    if (board.every((marker) => marker !== markers.empty)) return 'tie';
    return null;
  }

  /** Send a new game state to the channel. */
  async function startGame(channel: RealtimeChannel, opponentId: string) {
    const assignments =
      Math.random() < 0.5
        ? {
            usingO: userId,
            usingX: opponentId,
          }
        : {
            usingO: opponentId,
            usingX: userId,
          };
    const newState = {
      ...gameState,
      ...assignments,
      whoseTurn: assignments.usingX,
      board: Array(9).fill(markers.empty),
      winner: null,
    };
    await channel.send({
      type: 'broadcast',
      event: ChannelMessage.start,
      payload: newState,
    });
    setGameState(newState);
  }

  useEffect(() => {
    playSound();

    // setup channel and handlers
    const channel = supabase
      .channel('game', {
        config: { presence: { key: userId } },
      })
      .on('presence', { event: 'sync' }, () => {
        console.log(`user-${userId} syncing:`, channel.presenceState());

        // start a new game if there are 2 players and no game in progress
        if (gameState) return;
        if (Object.keys(channel.presenceState()).length !== 2) return;
        const opponentId = Object.keys(channel.presenceState()).find((id) => id !== userId);
        if (!opponentId) throw new Error('no opponentId');
        startGame(channel, opponentId);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        console.log(`user-${userId} received join event`, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        console.log(`user-${userId} received leave event`, leftPresences);

        if (Object.keys(channel.presenceState()).length === 1) setGameState(undefined);
      })
      .on('broadcast', { event: ChannelMessage.start }, ({ payload }) => {
        if (gameState) return;
        setGameState(payload);
      })
      .on('broadcast', { event: ChannelMessage.move }, ({ payload }) => setGameState(payload))
      .subscribe();

    channel.track({ userId });

    setChannel(channel);

    return () => {
      supabase.removeChannel(channel);
      channel.untrack();
    };
  }, []);

  function BoardMessage() {
    if (!gameState) return null;
    const [key] = useState(Math.random() + (gameState.whoseTurn ?? ''));
    const isUserTurn = gameState.whoseTurn === userId;

    const message = gameState.winner
      ? gameState.winner === 'tie'
        ? "It's a tie!"
        : gameState.winner === userId
          ? 'You win!'
          : 'You lose!'
      : isUserTurn
        ? 'Your turn'
        : 'Waiting for opponent';

    return (
      <Paragraph
        key={key}
        fontSize="$5"
        enterStyle={{
          scale: 1.2,
          opacity: 0,
        }}
        animation="quick">
        {message}
      </Paragraph>
    );
  }

  function BoardButton({ move }: { move: Move }) {
    if (!gameState || !channel) return null;
    const disabled =
      gameState.board[move] !== markers.empty || gameState.winner || gameState.whoseTurn !== userId;

    return (
      <Button
        margin="$2"
        width={75}
        height={75}
        animation={disabled ? ['quick', { x: 'shake' }] : undefined}
        pressStyle={disabled ? { x: '$2', backgroundColor: '$red10' } : undefined}
        onPress={() => (disabled ? null : handleMove(channel, move))}>
        {markers[gameState.board[move]]}
      </Button>
    );
  }

  function PlayAgainButton() {
    if (!gameState || !channel) return null;

    const opponentId = gameState.usingO === userId ? gameState.usingX : gameState.usingO;
    if (!opponentId) throw new Error('no opponentId');

    return (
      <Button
        backgroundColor="$blue5"
        size="$4"
        margin="$2"
        onPress={() => startGame(channel, opponentId)}>
        Play Again
      </Button>
    );
  }

  function Board() {
    if (!gameState) return <Paragraph>Waiting for opponent to join</Paragraph>;

    return (
      <>
        <BoardMessage />
        <YGroup marginBottom="$10">
          <XGroup>
            <BoardButton move={Move.topLeft} />
            <Separator vertical />
            <BoardButton move={Move.topMid} />
            <Separator vertical />
            <BoardButton move={Move.topRight} />
          </XGroup>
          <Separator />
          <XGroup>
            <BoardButton move={Move.midLeft} />
            <Separator vertical />
            <BoardButton move={Move.midMid} />
            <Separator vertical />
            <BoardButton move={Move.midRight} />
          </XGroup>
          <Separator />
          <XGroup>
            <BoardButton move={Move.bottomLeft} />
            <Separator vertical />
            <BoardButton move={Move.bottomMid} />
            <Separator vertical />
            <BoardButton move={Move.bottomRight} />
          </XGroup>
        </YGroup>
        <PlayAgainButton />
      </>
    );
  }

  return (
    <Container>
      <ScreenContent>
        <Board />
      </ScreenContent>
    </Container>
  );
}

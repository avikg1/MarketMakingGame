import React, { useEffect, useState, useContext } from "react";
import { Button, Box, Text, Flex, Heading, Stack, CircularProgress, CircularProgressLabel } from "@chakra-ui/react";
import SocketContext from "../../socket";
import GameScoreboard from "./GameScoreboard"; // Import the new component

export default function Admin({ userID, room }) {
  // --------------------------------------------
  //  A) State
  // --------------------------------------------
  // 1) 30-second countdown for this round
  const [roundTimeLeft, setRoundTimeLeft] = useState(30);

  // 2) Rounds remaining (start at 60 = 30 minutes)
  const [roundsRemaining, setRoundsRemaining] = useState(60);

  // 3) Current Brownian-motion-based price (display only; server has its own logic)
  const [currentPrice, setCurrentPrice] = useState(100);

  // 4) Final results from server
  const [results, setResults] = useState(null);

  // 5) Game state (playing or ended)
  const [gameState, setGameState] = useState("playing");

  // Socket from context
  const socket = useContext(SocketContext);

  // --------------------------------------------
  //  B) Brownian Motion Config & Helper
  // --------------------------------------------
  // Hidden random annualized volatility between 0.1 (10%) and 0.4 (40%)
  const [volatility] = useState(() => 0.1 + Math.random() * 0.3);

  // Annual risk-free rate = 5%
  const RISK_FREE_RATE = 0.05;

  // For a 30-second step as fraction of a year => 30 minutes = 1 year => each 30s step = 1/60 year
  // But here we do a 15-second fraction. Keep or adjust as suits your original logic.
  const SECONDS_PER_YEAR = 60 * 30; 
  const DELTA_T = 15 / SECONDS_PER_YEAR;

  // Box-Muller transform
  function randomNormal() {
    const u = 1 - Math.random(); // avoid log(0)
    const v = 1 - Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  // Geometric Brownian Motion step
  function evolvePrice(prev) {
    const z = randomNormal();
    return (
      prev *
      Math.exp(
        (RISK_FREE_RATE - 0.5 * volatility * volatility) * DELTA_T +
          volatility * Math.sqrt(DELTA_T) * z
      )
    );
  }

  // --------------------------------------------
  //  C) Effects
  // --------------------------------------------

  // 1) Listen for final results / game over
  useEffect(() => {
    socket.on("finalResults", (res) => {
      setResults(res);
      setGameState("ended");
    });

    socket.on("gameOver", (payload) => {
      console.log("Game Over:", payload.message);
      setGameState("ended");
      setRoundsRemaining(0);
    });

    return () => {
      socket.off("finalResults");
      socket.off("gameOver");
    };
  }, [socket]);

  // 2) A 1-second interval that counts down roundTimeLeft
  //    When it hits 0, we do the next round update
  useEffect(() => {
    if (gameState === "ended") return;
    
    const timer = setInterval(() => {
      setRoundTimeLeft((prev) => {
        if (prev <= 1) {
          // The "round boundary" is here
          // 1) Reset countdown
          const nextRoundTime = 30;

          // 2) Decrement roundsRemaining
          setRoundsRemaining((r) => {
            const newValue = r > 0 ? r - 1 : 0;
            // End game when time runs out
            if (newValue === 0 && gameState === "playing") {
              finalizeGame();
            }
            return newValue;
          });

          // 3) Optionally update local price with Brownian motion
          setCurrentPrice((old) => evolvePrice(old));

          // 4) Emit roundUpdate so the server does its usual logic
          if (roundsRemaining > 1) {
            socket.emit("roundUpdate", userID);
          }

          return nextRoundTime; // resets the local timer
        }
        // Otherwise, just decrement by 1
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [socket, userID, gameState, roundsRemaining, evolvePrice, finalizeGame]);

  // --------------------------------------------
  //  D) Game Control Functions
  // --------------------------------------------
  
  // Finalize game with current price
  const finalizeGame = () => {
    if (gameState !== "ended") {
      socket.emit("finalizeGame", userID, currentPrice);
      setGameState("ended");
    }
  };
  
  // Return to lobby function
  const returnToLobby = () => {
    socket.emit("returnToLobby", userID, room);
  };

  // Calculate time remaining in minutes and seconds
  const timeRemaining = () => {
    const totalSeconds = roundsRemaining * 30 - (30 - roundTimeLeft);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  // --------------------------------------------
  //  E) Display
  // --------------------------------------------
  
  // If game has ended, show the scoreboard
  if (gameState === "ended" && results) {
    return <GameScoreboard results={results} onReturnToLobby={() => returnToLobby()} room={room} />;
  }
  
  // During gameplay, show the game controls
  return (
    <Box textAlign="center" p={6} maxW="800px" mx="auto" bg="gray.800" borderRadius="xl" color="white">
      <Heading size="xl" mb={8} color="white">Game In Progress - Room: {room}</Heading>
      
      <Flex direction={{ base: "column", md: "row" }} justify="space-around" align="center" mb={8}>
        {/* Game Timer */}
        <Box mb={{ base: 6, md: 0 }}>
          <Text fontSize="xl" fontWeight="bold" mb={2} color="white">Overall Time Remaining</Text>
          <CircularProgress 
            value={(roundsRemaining / 60) * 100} 
            size="200px" 
            thickness="15px"
            color={roundsRemaining < 10 ? "red.400" : "blue.400"}
            trackColor="gray.600"
          >
            <CircularProgressLabel fontSize="3xl" color="white">{timeRemaining()}</CircularProgressLabel>
          </CircularProgress>
        </Box>
        
        {/* Current Round Timer */}
        <Box mb={{ base: 6, md: 0 }}>
          <Text fontSize="xl" fontWeight="bold" mb={2} color="white">Current Round</Text>
          <CircularProgress 
            value={(roundTimeLeft / 30) * 100} 
            size="200px" 
            thickness="15px"
            color={roundTimeLeft < 5 ? "orange.400" : "green.400"}
            trackColor="gray.600"
          >
            <CircularProgressLabel fontSize="3xl" color="white">{roundTimeLeft}s</CircularProgressLabel>
          </CircularProgress>
        </Box>
        
        {/* Price Display */}
        <Box>
          <Text fontSize="xl" fontWeight="bold" mb={2} color="white">Current Price</Text>
          <Box 
            p={4} 
            borderRadius="full" 
            boxShadow="lg" 
            bg="gray.700" 
            width="200px" 
            height="200px"
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            <Text fontSize="3xl" fontWeight="bold" color="white">
              ${currentPrice.toFixed(2)}
            </Text>
          </Box>
        </Box>
      </Flex>
      
      <Stack spacing={4} direction="column" align="center" mt={6}>
        <Text fontSize="xl" color="white">Rounds Remaining: {roundsRemaining}</Text>
        
        <Button 
          onClick={finalizeGame} 
          colorScheme="red" 
          size="lg" 
          width="250px"
          boxShadow="md"
        >
          End Game Now
        </Button>
      </Stack>
    </Box>
  );
}
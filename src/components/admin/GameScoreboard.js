import React from 'react';
import {
  Box,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Heading,
  Button,
  Flex,
  Badge,
  Text
} from '@chakra-ui/react';

const GameScoreboard = ({ results, onReturnToLobby, room}) => {
  // Sort players by Sharpe ratio in descending order
  const sortedPlayers = Object.entries(results || {}).sort((a, b) => {
    return b[1].sharpe - a[1].sharpe;
  });

  return (
    <Box
      borderWidth="1px"
      borderRadius="lg"
      overflow="hidden"
      boxShadow="lg"
      p={5}
      m={5}
      bg="gray.800"
      maxW="800px"
      mx="auto"
      color="white"
    >
      <Heading size="xl" textAlign="center" mb={6} color="white">
        Final Results
      </Heading>
      
      <Table variant="simple" size="lg">
        <Thead>
          <Tr>
            <Th bg="gray.700" color="white" borderRadius="md" p={4}>Rank</Th>
            <Th bg="gray.700" color="white" p={4}>Player</Th>
            <Th bg="gray.700" color="white" p={4} isNumeric>Sharpe Ratio</Th>
            <Th bg="gray.700" color="white" borderRadius="md" p={4} isNumeric>Final P&L</Th>
          </Tr>
        </Thead>
        <Tbody>
          {sortedPlayers.map((player, index) => {
            const [userId, playerData] = player;
            const isWinner = index === 0;
            
            // Calculate P&L (assuming starting cash was 100)
            const pnl = playerData.finalCash - 100;
            const isProfitable = pnl >= 0;
            
            return (
              <Tr 
                key={userId} 
                bg={index % 2 === 0 ? "gray.700" : "gray.600"}
                _hover={{ bg: 'gray.500' }}
              >
                <Td p={4} color="white">
                  {index === 0 ? (
                    <Badge colorScheme="yellow" p={2} borderRadius="full" fontSize="md">
                      🏆 1st
                    </Badge>
                  ) : index === 1 ? (
                    <Badge colorScheme="gray" p={2} borderRadius="full" fontSize="md">
                      🥈 2nd
                    </Badge>
                  ) : index === 2 ? (
                    <Badge colorScheme="orange" p={2} borderRadius="full" fontSize="md">
                      🥉 3rd
                    </Badge>
                  ) : (
                    `${index + 1}th`
                  )}
                </Td>
                <Td p={4} fontWeight={isWinner ? "bold" : "normal"} color="white">
                  {playerData.username}
                  {isWinner && <span> 👑</span>}
                </Td>
                <Td p={4} isNumeric fontWeight="bold" color="white">
                  {playerData.sharpe.toFixed(2)}
                </Td>
                <Td p={4} isNumeric>
                  <Text
                    color={isProfitable ? "green.300" : "red.300"}
                    fontWeight="bold"
                  >
                    {isProfitable ? "+" : ""}${pnl.toFixed(2)}
                  </Text>
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
      
      <Flex justifyContent="center" mt={8}>
        <Button
          colorScheme="blue"
          size="lg"
          onClick={onReturnToLobby}
          boxShadow="md"
        >
          Return Everyone to Lobby
        </Button>
      </Flex>
    </Box>
  );
};

export default GameScoreboard;
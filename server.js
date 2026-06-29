require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Serve static files from the React frontend app
app.use(express.static(path.join(__dirname, '../client/dist')));

// In-memory store for quick lookups
const sessions = {}; 
// e.g., { "CODE123": { state: "lobby", teams: [{ code: "T1", members: [], isReady: false }], currentPretestIndex: 0 } }

const PRETEST_QUESTIONS = [
  {
    question: "What is the primary purpose of WebSocket in our app?",
    options: {
      A: "To style the page",
      B: "To establish bi-directional real-time communication",
      C: "To save data locally",
      D: "To replace HTML"
    },
    answer: "B"
  },
  {
    question: "Which feature is essential for a Team-Based Quiz?",
    options: {
      A: "Single-player mode",
      B: "Offline availability",
      C: "Synchronized state across team devices",
      D: "Static HTML pages"
    },
    answer: "C"
  },
  {
    question: "Why do we require reasoning for each quiz answer?",
    options: {
      A: "To make the quiz longer",
      B: "To test typing speed",
      C: "To encourage team discussion and critical thinking",
      D: "Because the database needs text"
    },
    answer: "C"
  }
];

const POSTTEST_QUESTIONS = [
  {
    mediaUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
    mediaType: "video",
    question: "Based on the video, why is Socket.io used in this application instead of traditional HTTP polling?",
    options: {
      A: "It relies entirely on MongoDB to push updates",
      B: "It provides event-based, low-latency bi-directional synchronization",
      C: "It is the only way to style React components dynamically"
    },
    answer: "B"
  },
  {
    mediaUrl: "https://images.unsplash.com/photo-1633356122544-f134324a6cee?q=80&w=800",
    mediaType: "image",
    question: "Based on the React logo above, which of the following is true?",
    options: {
      A: "React uses a virtual DOM",
      B: "React is a backend framework",
      C: "React only supports class components"
    },
    answer: "A"
  },
  {
    mediaType: "text",
    question: "Apa keunggulan utama menggunakan pola manajemen state seperti Zustand dibandingkan Context API biasa?",
    options: {
      A: "Zustand memerlukan lebih banyak boilerplate kode",
      B: "Zustand meminimalkan re-render yang tidak perlu tanpa perlu membungkus komponen dengan Provider",
      C: "Zustand hanya dapat digunakan pada aplikasi berbasis class components"
    },
    answer: "B"
  },
  {
    mediaType: "text",
    question: "Dalam implementasi Socket.io, apa fungsi utama dari `io.to(room).emit()`?",
    options: {
      A: "Mengirimkan pesan ke satu socket id spesifik",
      B: "Mengirim pesan kepada semua client yang terhubung di server",
      C: "Mengirim pesan secara spesifik kepada kelompok (room) klien tertentu"
    },
    answer: "C"
  },
  {
    mediaType: "text",
    question: "Mengapa penting menyimpan state kolaboratif (seperti skor atau kesiapan tim) di server, bukan di browser masing-masing?",
    options: {
      A: "Agar browser tidak perlu mengunduh file HTML",
      B: "Untuk menjaga integritas data dan mencegah manipulasi (cheat) dari sisi klien",
      C: "Karena React tidak mendukung penyimpanan state lokal"
    },
    answer: "B"
  }
];

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Host creates session
  socket.on('create_session', (data) => {
    const sessionCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    sessions[sessionCode] = { host: socket.id, state: 'lobby', participants: [], teams: [], currentPretestIndex: 0 };
    socket.join(sessionCode);
    socket.emit('session_created', { sessionCode });
  });

  // Team joins session
  socket.on('team_join_session', ({ sessionCode, teamCode }) => {
    if (sessions[sessionCode]) {
      const team = sessions[sessionCode].teams.find(t => t.code === teamCode);
      if (team) {
        // Team found, join socket to session and emit state
        socket.join(sessionCode);
        socket.emit('team_joined', { sessionCode, team });
        
        // Emit current state so team knows where they are
        socket.emit('session_state_update', sessions[sessionCode].state);
        socket.emit('teams_assigned', { teams: sessions[sessionCode].teams });
        
        if (sessions[sessionCode].state === 'pretest') {
          socket.emit('pretest_question_update', {
            index: sessions[sessionCode].currentPretestIndex,
            total: PRETEST_QUESTIONS.length,
            question: PRETEST_QUESTIONS[sessions[sessionCode].currentPretestIndex]
          });
        }
      } else {
        socket.emit('error', 'Invalid Team Code');
      }
    } else {
      socket.emit('error', 'Session not found');
    }
  });

  // Host manually adds a participant
  socket.on('host_add_participant', ({ sessionCode, name }) => {
    if (sessions[sessionCode]) {
      const participant = { id: `manual-${Date.now()}-${Math.random()}`, name, pretestCompleted: true };
      sessions[sessionCode].participants.push(participant);
      io.to(sessionCode).emit('lobby_update', sessions[sessionCode].participants);
    }
  });

  // Participant completes pretest
  socket.on('submit_pretest', ({ sessionCode }) => {
    if (sessions[sessionCode]) {
      const p = sessions[sessionCode].participants.find(p => p.id === socket.id);
      if (p) p.pretestCompleted = true;
      io.to(sessionCode).emit('lobby_update', sessions[sessionCode].participants);
    }
  });

  // Host randomizes teams
  socket.on('randomize_teams', ({ sessionCode, teamCount }) => {
    if (sessions[sessionCode]) {
      const session = sessions[sessionCode];
      session.state = 'grouping';
      
      const parts = [...session.participants];
      const teams = Array.from({ length: teamCount }, (_, i) => ({
        code: `TEAM-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        name: `Team ${i + 1}`,
        members: [],
        isReady: false,
        score: 0,
        pretestScore: 0,
        quizScore: 0
      }));

      // Distribute
      parts.sort(() => Math.random() - 0.5);
      parts.forEach((p, i) => {
        const teamIndex = i % teamCount;
        teams[teamIndex].members.push(p);
      });

      session.teams = teams;
      io.to(sessionCode).emit('teams_assigned', { teams });
      session.state = 'waiting_teams'; // Wait for teams to join
      io.to(sessionCode).emit('session_state_update', 'waiting_teams');
    }
  });

  // Host advances session state
  socket.on('host_advance_state', ({ sessionCode, newState }) => {
    if (sessions[sessionCode]) {
      sessions[sessionCode].state = newState;
      if (newState === 'pretest') {
        sessions[sessionCode].currentPretestIndex = 0;
        sessions[sessionCode].teams.forEach(t => t.pretestCompleted = false);
      }
      io.to(sessionCode).emit('session_state_update', newState);
      
      if (newState === 'pretest') {
        io.to(sessionCode).emit('pretest_question_update', {
          index: 0,
          total: PRETEST_QUESTIONS.length,
          question: PRETEST_QUESTIONS[0]
        });
      }
    }
  });

  // Host next pretest question
  socket.on('host_next_pretest_question', ({ sessionCode }) => {
    if (sessions[sessionCode]) {
      const session = sessions[sessionCode];
      if (session.currentPretestIndex < PRETEST_QUESTIONS.length - 1) {
        session.currentPretestIndex += 1;
        session.teams.forEach(t => t.pretestCompleted = false);
        
        io.to(sessionCode).emit('readiness_update', session.teams);
        io.to(sessionCode).emit('pretest_question_update', {
          index: session.currentPretestIndex,
          total: PRETEST_QUESTIONS.length,
          question: PRETEST_QUESTIONS[session.currentPretestIndex]
        });
      }
    }
  });

  // Participant toggle ready
  socket.on('toggle_ready', ({ sessionCode, teamCode }) => {
    if (sessions[sessionCode]) {
      const team = sessions[sessionCode].teams.find(t => t.code === teamCode);
      if (team) {
        team.isReady = !team.isReady;
        io.to(sessionCode).emit('readiness_update', sessions[sessionCode].teams);
      }
    }
  });

  // Team submits pretest
  socket.on('team_submit_pretest', ({ sessionCode, teamCode, answer }) => {
    if (sessions[sessionCode]) {
      const session = sessions[sessionCode];
      const team = session.teams.find(t => t.code === teamCode);
      if (team && !team.pretestCompleted) {
        team.pretestCompleted = true;
        const currentQ = PRETEST_QUESTIONS[session.currentPretestIndex];
        if (currentQ && answer === currentQ.answer) {
          team.score = (team.score || 0) + 100;
          team.pretestScore = (team.pretestScore || 0) + 100;
        }
        io.to(sessionCode).emit('readiness_update', session.teams);
      }
    }
  });

  // Host starts quiz
  socket.on('start_quiz', ({ sessionCode }) => {
    if (sessions[sessionCode]) {
      const allReady = sessions[sessionCode].teams.every(t => t.isReady);
      if (allReady) {
        sessions[sessionCode].state = 'quiz';
        sessions[sessionCode].currentQuizIndex = 0;
        sessions[sessionCode].teams.forEach(t => t.quizCompleted = false);
        io.to(sessionCode).emit('quiz_started');
        io.to(sessionCode).emit('session_state_update', 'quiz');
        io.to(sessionCode).emit('quiz_question_update', {
          index: 0,
          total: POSTTEST_QUESTIONS.length,
          question: POSTTEST_QUESTIONS[0]
        });
      } else {
        socket.emit('error', 'Not all teams are ready');
      }
    }
  });

  // Team submits quiz
  socket.on('team_submit_quiz', ({ sessionCode, teamCode, answer, reasoning }) => {
    if (sessions[sessionCode]) {
      const session = sessions[sessionCode];
      const team = session.teams.find(t => t.code === teamCode);
      if (team && !team.quizCompleted) {
        team.quizCompleted = true;
        team.lastAnswer = answer;
        team.lastReasoning = reasoning;
        const currentQ = POSTTEST_QUESTIONS[session.currentQuizIndex];
        const isCorrect = currentQ && answer === currentQ.answer;
        if (isCorrect) {
          team.score = (team.score || 0) + 100;
          team.quizScore = (team.quizScore || 0) + 100;
        }
        // Send immediate feedback to the specific team's socket
        socket.emit('quiz_answer_result', { isCorrect, correctAnswer: currentQ?.answer, scoreAdded: isCorrect ? 100 : 0 });
        io.to(sessionCode).emit('readiness_update', session.teams);
      }
    }
  });

  // Host next quiz question
  socket.on('host_next_quiz_question', ({ sessionCode }) => {
    if (sessions[sessionCode]) {
      const session = sessions[sessionCode];
      if (session.currentQuizIndex < POSTTEST_QUESTIONS.length - 1) {
        session.currentQuizIndex += 1;
        session.teams.forEach(t => t.quizCompleted = false);
        
        io.to(sessionCode).emit('readiness_update', session.teams);
        io.to(sessionCode).emit('quiz_question_update', {
          index: session.currentQuizIndex,
          total: POSTTEST_QUESTIONS.length,
          question: POSTTEST_QUESTIONS[session.currentQuizIndex]
        });
      } else {
        // Quiz finished
        session.state = 'leaderboard';
        io.to(sessionCode).emit('session_state_update', 'leaderboard');
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // basic cleanup can be added here
  });
});

// Anything that doesn't match the above, send back index.html
app.get(/(.*)/, (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

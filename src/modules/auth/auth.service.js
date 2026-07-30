const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authRepository = require('./auth.repository');

class AuthService {
  async register({ name, email, password, role }) {
    const existingUser = await authRepository.findByEmail(email);
    if (existingUser) {
      const error = new Error('Email address is already registered.');
      error.statusCode = 409;
      throw error;
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const newUser = await authRepository.createUser({
      name,
      email,
      passwordHash,
      role,
    });

    const token = this.generateToken(newUser);

    return { user: newUser, token };
  }

  async login({ email, password }) {
    const user = await authRepository.findByEmail(email);
    if (!user) {
      const error = new Error('Invalid email or password.');
      error.statusCode = 401;
      throw error;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      const error = new Error('Invalid email or password.');
      error.statusCode = 401;
      throw error;
    }

    const { password: _, ...userWithoutPassword } = user;
    const token = this.generateToken(userWithoutPassword);

    return { user: userWithoutPassword, token };
  }

  generateToken(user) {
    const secret = process.env.JWT_SECRET || 'madayawgas_super_secret_jwt_key_2026_change_in_prod';
    const expiresIn = process.env.JWT_EXPIRES_IN || '1d';

    return jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      secret,
      { expiresIn }
    );
  }
}

module.exports = new AuthService();

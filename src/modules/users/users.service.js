const userRepository = require('./users.repository');

class UserService {
  async getAllUsers() {
    return await userRepository.findAll();
  }

  async getUserById(id) {
    const user = await userRepository.findById(id);
    if (!user) {
      const error = new Error(`User with ID ${id} not found.`);
      error.statusCode = 404;
      throw error;
    }
    return user;
  }

  async updateUser(id, updateData) {
    await this.getUserById(id);
    return await userRepository.update(id, updateData);
  }

  async deleteUser(id) {
    await this.getUserById(id);
    return await userRepository.delete(id);
  }
}

module.exports = new UserService();

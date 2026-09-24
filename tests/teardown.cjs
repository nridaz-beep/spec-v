module.exports = async () => {
  await fetch('http://127.0.0.1:4173/__test/shutdown', { method: 'POST' });
};

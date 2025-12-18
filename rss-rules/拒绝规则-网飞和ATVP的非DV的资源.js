(torrent) => {
  const { name } = torrent;

  // NF片源不含有DV或DoVi，则忽略
  if (/NF|ATVP/i.test(name)) {
    if (!/DV|DoVi/i.test(name)) {
      return true;
    }
    if (/HDR/i.test(name)) {
      return true;
    }
  }
  return false;
}
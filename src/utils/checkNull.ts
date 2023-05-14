export default (data: any | string | any[]): boolean => {
  if (!Array.isArray(data)) data = [data];

  for (const i in data) {
    if (
      data[i] === null ||
      data[i] === "null" ||
      data[i] === undefined ||
      data[i] === "undefined" ||
      data[i] === "" ||
      Number.isNaN(data[i])
    ) {
      return true;
    }
  }

  return false;
}
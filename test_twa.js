const initData = "query_id=AAHdF...&user=%7B%22id%22%3A123%7D&auth_date=1723758282&hash=abc&start_param=ref_8280101176";
console.log(new URLSearchParams(initData).get('start_param'));

import Things from './Things';

const func = async () => {
//   setTimeout(async () => {
//     const response = await http.request({
//       url: '/schemas/Light_A60__2.0.0',
//       method: 'get',
//     });
//     console.log(response);
//   }, 3000);
  setTimeout(async () => {
    const response = await import("./schemas/Light_A60__2.0.0.json");
    console.log(response);
  }, 3000);

//   const userId = '70155dfbfd6143a895964cbb1f1c8ba9';
//   const devices = [
//     {
//       id: 'd1',
//       directId: '',
//       schemaUrl: 'Light_A60__2.0.0',
//     },
//     {
//       id: 'd2',
//       directId: 'd1',
//       schemaUrl: 'Gateway_G110__2.0.0',
//     },
//   ];
//   const things = new Things(userId, devices);
//   window.things = things;

//   const thing1 = await things.get('d1');
//   console.log(11111, thing1);
//   const thing2 = await things.get('d1');
//   console.log(11112, thing2);

//   setTimeout(async () => {
//     const thing3 = await things.get('d2');
//     console.log(11113, thing3);
//   }, 3000);
//   setTimeout(async () => {
//     const thing4 = await things.get('d2');
//     console.log(11114, thing4);
//   }, 6000);

//   things.addListener((message) => {
//     console.log('things:listener', message);
//   });

//   thing1.addListener((message) => {
//     console.log('thing1:listener', message);
//   });

//   thing2.addListener((message) => {
//     console.log('thing2:listener', message);
//   });

  // things.set({ id: 'd3', directId: '', schemaUrl: 'pm_ver3' });
  // const thing5 = await things.get('d3');
  // console.log(11115, thing5);
};

func();

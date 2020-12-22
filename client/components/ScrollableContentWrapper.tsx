import React, { CSSProperties, FC } from 'react';
import SimpleBar from 'simplebar-react';
import 'simplebar/src/simplebar.css';

import { useDir } from '../hooks/useDir';


const styleDefault = {
	maxHeight: '100%', flexGrow: 1,
};


type CustomScrollbarsProps = {
	onScroll?: Function;
	ref: React.Ref<unknown>;
	style?: CSSProperties;
}

const ScrollableContentWrapper: FC<CustomScrollbarsProps> = React.memo(React.forwardRef(({ onScroll, children, style = styleDefault }, ref) => {
	const dir = useDir();
	return <SimpleBar data-simplebar-direction={dir} direction={dir} style={style} scrollableNodeProps={{ ref, onScroll }} children={children}/>;
}));

export default ScrollableContentWrapper;

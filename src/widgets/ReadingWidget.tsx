import { Column, Spacer, Text } from '@expo/ui/jetpack-compose';
import { background, fillMaxSize, fillMaxWidth, height, paddingAll } from '@expo/ui/jetpack-compose/modifiers';
import { createWidget } from 'expo-widgets';

/**
 * Ana ekran widget'ı: "Şu an okuduklarım". Widget ayrı, izole bir
 * çalışma ortamında çizilir — hook, state ya da modül düzeyindeki
 * değişkenler kullanılamaz; her şey props ile gelir (bkz. updateReadingWidget).
 */
export type ReadingWidgetProps = {
  heading: string;
  empty: string;
  books: { title: string; author: string }[];
  dark: boolean;
};

const ReadingWidgetView = (props: ReadingWidgetProps) => {
  'widget';
  const bg = props.dark ? '#1E1F1C' : '#FFFEFB';
  const text = props.dark ? '#ECEAE4' : '#2B2A27';
  const muted = props.dark ? '#A19D94' : '#77736B';
  const accent = props.dark ? '#8DB59A' : '#5E8A6D';

  return (
    <Column modifiers={[fillMaxSize(), background(bg), paddingAll(14)]}>
      <Text color={accent} style={{ fontSize: 12, fontWeight: '700' }}>
        {props.heading}
      </Text>
      <Spacer modifiers={[height(6)]} />
      {props.books.length === 0 ? (
        <Text color={muted} style={{ fontSize: 13 }} maxLines={3}>
          {props.empty}
        </Text>
      ) : (
        props.books.map((book, i) => (
          <Column key={i} modifiers={[fillMaxWidth()]}>
            <Text color={text} style={{ fontSize: 15, fontWeight: '600', fontFamily: 'serif' }} maxLines={2} overflow="ellipsis">
              {book.title}
            </Text>
            {book.author ? (
              <Text color={muted} style={{ fontSize: 12 }} maxLines={1} overflow="ellipsis">
                {book.author}
              </Text>
            ) : null}
            <Spacer modifiers={[height(8)]} />
          </Column>
        ))
      )}
    </Column>
  );
};

export default createWidget<ReadingWidgetProps>('ReadingWidget', ReadingWidgetView, {
  heading: 'ŞU AN OKUDUKLARIM',
  empty: 'Şu an okuduğunuz bir kitap yok.',
  books: [],
  dark: false,
});
